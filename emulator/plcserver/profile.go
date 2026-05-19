package plcserver

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"sort"
	"strings"
	"sync"
	"time"
)

type Profile struct {
	Name string      `json:"name"`
	Path string      `json:"path"`
	Tags []TagConfig `json:"tags"`
	UDTs []UDTConfig `json:"udts"`
}

type TagConfig struct {
	Name       string         `json:"name"`
	Type       string         `json:"type"`
	Dimensions []uint32       `json:"dimensions"`
	Value      any            `json:"value"`
	Behavior   BehaviorConfig `json:"behavior"`
}

type UDTConfig struct {
	Name     string      `json:"name"`
	Instance string      `json:"instance"`
	Fields   []TagConfig `json:"fields"`
}

type BehaviorConfig struct {
	Kind      string  `json:"kind"`
	Step      float64 `json:"step"`
	Amplitude float64 `json:"amplitude"`
	PeriodMs  int64   `json:"periodMs"`
}

type PLC struct {
	Name       string
	Path       []byte
	startedAt  time.Time
	mu         sync.RWMutex
	tags       map[string]*Tag
	topLevel   []*Symbol
	scoped     map[string][]*Symbol
	udts       map[uint16]*UDTDef
	nextInstID uint32
}

type Symbol struct {
	InstanceID uint32
	Name       string
	Type       uint16
	ElementLen uint16
	Dimensions [3]uint32
}

type Tag struct {
	Symbol
	Value       []byte
	Behavior    BehaviorConfig
	baseFloat   float64
	writable    bool
	lastCounter int64
}

type UDTDef struct {
	ID           uint16
	Name         string
	InstanceSize uint32
	Handle       uint16
	Fields       []UDTField
	Payload      []byte
	WordSize     uint32
}

type UDTField struct {
	Name     string
	Type     uint16
	Metadata uint16
	Offset   uint32
}

const (
	typeBool   uint16 = 0x00C1
	typeSint   uint16 = 0x00C2
	typeInt    uint16 = 0x00C3
	typeDint   uint16 = 0x00C4
	typeLint   uint16 = 0x00C5
	typeReal   uint16 = 0x00CA
	typeString uint16 = 0x00D0
	typeStruct uint16 = 0x8000
)

func LoadProfile(path string) (*PLC, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var profile Profile
	if err := json.Unmarshal(data, &profile); err != nil {
		return nil, err
	}
	return NewPLC(profile)
}

func NewPLC(profile Profile) (*PLC, error) {
	plc := &PLC{
		Name:       profile.Name,
		Path:       encodePortPath(defaultString(profile.Path, "1,0")),
		startedAt:  time.Now(),
		tags:       make(map[string]*Tag),
		scoped:     make(map[string][]*Symbol),
		udts:       make(map[uint16]*UDTDef),
		nextInstID: 1,
	}

	for _, cfg := range profile.Tags {
		tag, err := plc.newTag(cfg.Name, cfg)
		if err != nil {
			return nil, err
		}
		plc.tags[tag.Name] = tag
		plc.topLevel = append(plc.topLevel, &tag.Symbol)
	}

	for index, udt := range profile.UDTs {
		if strings.TrimSpace(udt.Instance) == "" {
			return nil, fmt.Errorf("UDT %q is missing instance", udt.Name)
		}
		typeID := uint16(index + 1)
		def := &UDTDef{
			ID:     typeID,
			Name:   udt.Name,
			Handle: typeID,
		}
		container := &Symbol{
			InstanceID: plc.nextInstanceID(),
			Name:       udt.Instance,
			Type:       typeStruct | typeID,
			ElementLen: uint16(max(1, len(udt.Fields))),
		}
		plc.topLevel = append(plc.topLevel, container)
		var fieldOffset uint32
		for _, field := range udt.Fields {
			fullName := udt.Instance + "." + field.Name
			tag, err := plc.newTag(fullName, field)
			if err != nil {
				return nil, err
			}
			plc.tags[tag.Name] = tag
			child := tag.Symbol
			child.Name = field.Name
			plc.scoped[udt.Instance] = append(plc.scoped[udt.Instance], &child)
			def.Fields = append(def.Fields, UDTField{
				Name:   field.Name,
				Type:   tag.Type,
				Offset: fieldOffset,
			})
			fieldOffset += uint32(tag.ElementLen)
		}
		def.InstanceSize = fieldOffset
		def.Payload = encodeUDTPayload(def)
		def.WordSize = uint32((len(def.Payload) + 23 + 3) / 4)
		plc.udts[typeID] = def
	}

	sortSymbols(plc.topLevel)
	for scope := range plc.scoped {
		sortSymbols(plc.scoped[scope])
	}
	return plc, nil
}

func (p *PLC) UDT(id uint16) (*UDTDef, bool) {
	p.mu.RLock()
	defer p.mu.RUnlock()
	def := p.udts[id]
	return def, def != nil
}

func (p *PLC) Read(name string, count uint16, byteOffset uint32) (uint16, []byte, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	tag := p.tags[name]
	if tag == nil {
		return 0, nil, false
	}
	p.applyBehavior(tag)
	start := int(byteOffset)
	total := int(count)
	if total <= 0 {
		total = 1
	}
	size := total * int(tag.ElementLen)
	if start > len(tag.Value) || start+size > len(tag.Value) {
		return 0, nil, false
	}
	data := make([]byte, size)
	copy(data, tag.Value[start:start+size])
	return tag.Type, data, true
}

func (p *PLC) Write(name string, typ uint16, count uint16, byteOffset uint32, data []byte) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	tag := p.tags[name]
	if tag == nil || !tag.writable || tag.Type != typ {
		return false
	}
	start := int(byteOffset)
	total := int(count)
	if total <= 0 {
		total = 1
	}
	size := total * int(tag.ElementLen)
	if len(data) < size || start > len(tag.Value) || start+size > len(tag.Value) {
		return false
	}
	copy(tag.Value[start:start+size], data[:size])
	if tag.Type == typeReal && len(tag.Value) >= 4 {
		tag.baseFloat = float64(math.Float32frombits(le.Uint32(tag.Value[:4])))
	}
	return true
}

func (p *PLC) List(scope string, after uint32, maxBytes int) ([]byte, bool) {
	p.mu.RLock()
	defer p.mu.RUnlock()
	symbols := p.topLevel
	if scope != "" {
		symbols = p.scoped[scope]
	}
	var out []byte
	fragmented := false
	for _, symbol := range symbols {
		if symbol.InstanceID < after {
			continue
		}
		entry := encodeSymbol(symbol)
		if maxBytes > 0 && len(out) > 0 && len(out)+len(entry) > maxBytes {
			fragmented = true
			break
		}
		out = append(out, entry...)
	}
	return out, fragmented
}

func (p *PLC) newTag(name string, cfg TagConfig) (*Tag, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("tag name is required")
	}
	typ, elemSize, err := cipType(cfg.Type)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", name, err)
	}
	dims := [3]uint32{1, 0, 0}
	elemCount := uint32(1)
	if len(cfg.Dimensions) > 0 {
		dims = [3]uint32{}
		elemCount = 1
		for i, dim := range cfg.Dimensions {
			if i >= 3 {
				return nil, fmt.Errorf("%s: only three dimensions are supported", name)
			}
			if dim == 0 {
				return nil, fmt.Errorf("%s: dimensions must be greater than zero", name)
			}
			dims[i] = dim
			elemCount *= dim
		}
	}
	value, base, err := encodeInitialValue(typ, elemSize, elemCount, cfg.Value)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", name, err)
	}
	tag := &Tag{
		Symbol: Symbol{
			InstanceID: plcNextID(p),
			Name:       name,
			Type:       typ,
			ElementLen: uint16(elemSize),
			Dimensions: dims,
		},
		Value:     value,
		Behavior:  cfg.Behavior,
		baseFloat: base,
		writable:  true,
	}
	return tag, nil
}

func plcNextID(p *PLC) uint32 {
	return p.nextInstanceID()
}

func (p *PLC) nextInstanceID() uint32 {
	id := p.nextInstID
	p.nextInstID++
	return id
}

func (p *PLC) applyBehavior(tag *Tag) {
	switch strings.ToLower(tag.Behavior.Kind) {
	case "counter":
		period := tag.Behavior.PeriodMs
		if period <= 0 {
			period = 1000
		}
		tick := time.Since(p.startedAt).Milliseconds() / period
		if tick == tag.lastCounter {
			return
		}
		tag.lastCounter = tick
		step := tag.Behavior.Step
		if step == 0 {
			step = 1
		}
		if tag.Type == typeDint && len(tag.Value) >= 4 {
			current := int32(le.Uint32(tag.Value[:4]))
			le.PutUint32(tag.Value[:4], uint32(current+int32(step)))
		}
	case "sine":
		if tag.Type != typeReal || len(tag.Value) < 4 {
			return
		}
		period := tag.Behavior.PeriodMs
		if period <= 0 {
			period = 10000
		}
		amp := tag.Behavior.Amplitude
		if amp == 0 {
			amp = 1
		}
		phase := float64(time.Since(p.startedAt).Milliseconds()%period) / float64(period)
		value := tag.baseFloat + math.Sin(phase*2*math.Pi)*amp
		le.PutUint32(tag.Value[:4], math.Float32bits(float32(value)))
	}
}

func sortSymbols(symbols []*Symbol) {
	sort.Slice(symbols, func(i, j int) bool {
		return symbols[i].Name < symbols[j].Name
	})
}

func defaultString(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}
