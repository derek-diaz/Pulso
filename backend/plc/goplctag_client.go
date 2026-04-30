//go:build libplctag

package plc

import (
	"encoding/hex"
	"fmt"
	"net"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/libplctag/goplctag"
)

type GoPLCClient struct {
	mu        sync.Mutex
	config    ConnectionConfig
	connected bool
}

func NewGoPLCClient() *GoPLCClient {
	return &GoPLCClient{}
}

func (c *GoPLCClient) Connect(config ConnectionConfig) error {
	if err := validateConfig(config); err != nil {
		return err
	}

	endpoint := config.Address
	if !strings.Contains(endpoint, ":") {
		endpoint += ":44818"
	}
	conn, err := net.DialTimeout("tcp", endpoint, timeout(config.TimeoutMs))
	if err != nil {
		return fmt.Errorf("PLC TCP connection failed: %w", err)
	}
	_ = conn.Close()

	c.mu.Lock()
	c.config = config
	c.connected = true
	c.mu.Unlock()
	return nil
}

func (c *GoPLCClient) Disconnect() error {
	c.mu.Lock()
	c.connected = false
	c.mu.Unlock()
	return nil
}

func (c *GoPLCClient) IsConnected() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.connected
}

func (c *GoPLCClient) Read(tag WatchedTag) (any, error) {
	c.mu.Lock()
	config := c.config
	connected := c.connected
	c.mu.Unlock()
	if !connected {
		return nil, fmt.Errorf("PLC is not connected")
	}

	handle, err := createHandle(config, tag)
	if err != nil {
		return nil, err
	}
	defer goplctag.Destroy(handle)

	if rc := goplctag.Read(handle, int32(config.TimeoutMs)); rc != goplctag.StatusOk {
		return nil, fmt.Errorf("read failed: %s", goplctag.DecodeError(rc))
	}
	return readValue(handle, tag)
}

func (c *GoPLCClient) Write(tag WatchedTag, value any) error {
	c.mu.Lock()
	config := c.config
	connected := c.connected
	c.mu.Unlock()
	if !connected {
		return fmt.Errorf("PLC is not connected")
	}

	handle, err := createHandle(config, tag)
	if err != nil {
		return err
	}
	defer goplctag.Destroy(handle)

	normalized, err := NormalizeValue(tag.DataType, value)
	if err != nil {
		return err
	}
	if err := setValue(handle, tag, normalized); err != nil {
		return err
	}
	if rc := goplctag.Write(handle, int32(config.TimeoutMs)); rc != goplctag.StatusOk {
		return fmt.Errorf("write failed: %s", goplctag.DecodeError(rc))
	}
	return nil
}

func (c *GoPLCClient) DiscoverTags(progress func(DiscoveryProgress)) ([]DiscoveredTag, error) {
	c.mu.Lock()
	config := c.config
	connected := c.connected
	c.mu.Unlock()
	if !connected {
		return nil, fmt.Errorf("PLC is not connected")
	}

	baseAttrs := strings.Join([]string{
		"protocol=ab-eip",
		"gateway=" + config.Address,
		"path=" + config.Path,
		"plc=ControlLogix",
		"name=",
	}, "&")

	emitDiscoveryProgress(progress, "controller", "Reading controller tag list", 0, 0)
	controllerTags, err := readTagListing(baseAttrs, "@tags", "", int32(config.TimeoutMs))
	if err != nil {
		return nil, err
	}
	emitDiscoveryProgress(progress, "controller", fmt.Sprintf("Read %d controller tags", len(controllerTags)), len(controllerTags), len(controllerTags))

	tags := append([]DiscoveredTag{}, controllerTags...)
	programTagsRead := 0
	for _, tag := range controllerTags {
		if strings.HasPrefix(tag.Name, "Program:") {
			emitDiscoveryProgress(progress, "program", fmt.Sprintf("Reading %s scope", tag.Name), programTagsRead, 0)
			programTags, err := readTagListing(baseAttrs, tag.Name+".@tags", tag.Name, int32(config.TimeoutMs))
			if err != nil {
				continue
			}
			tags = append(tags, programTags...)
			programTagsRead += len(programTags)
			emitDiscoveryProgress(progress, "program", fmt.Sprintf("Read %d program-scoped tags", programTagsRead), programTagsRead, 0)
		}
	}

	structuredParents := countStructuredTags(tags)
	emitDiscoveryProgress(progress, "udt", fmt.Sprintf("Inspecting %d UDT containers", structuredParents), 0, structuredParents)
	expanded, schemaErrors := expandStructuredTags(baseAttrs, tags, int32(config.TimeoutMs), progress)
	for i := range tags {
		if !isStructType(tags[i].RawType) {
			continue
		}
		if errMessage := schemaErrors[tags[i].RawType&typeUDTIDMask]; errMessage != "" {
			tags[i].UnsupportedReason = errMessage
		}
	}
	tags = append(tags, expanded...)
	emitDiscoveryProgress(progress, "members", fmt.Sprintf("Expanded %d readable member fields", len(expanded)), len(expanded), len(expanded))

	sort.Slice(tags, func(i, j int) bool {
		return tags[i].Name < tags[j].Name
	})
	emitDiscoveryProgress(progress, "complete", fmt.Sprintf("Discovered %d PLC tag entries", len(tags)), len(tags), len(tags))
	return tags, nil
}

func validateConfig(config ConnectionConfig) error {
	if strings.TrimSpace(config.Address) == "" {
		return fmt.Errorf("PLC IP address is required")
	}
	if strings.TrimSpace(config.Path) == "" {
		return fmt.Errorf("PLC path is required")
	}
	if config.TimeoutMs <= 0 {
		return fmt.Errorf("timeout must be greater than zero")
	}
	return nil
}

func readTagListing(baseAttrs, listingName, parentScope string, timeoutMs int32) ([]DiscoveredTag, error) {
	handle := goplctag.Create(baseAttrs+listingName, timeoutMs)
	if handle < 0 {
		return nil, fmt.Errorf("could not create PLC tag listing handle for %s: %s", listingName, goplctag.DecodeError(handle))
	}
	defer goplctag.Destroy(handle)

	if rc := goplctag.Read(handle, timeoutMs); rc != goplctag.StatusOk {
		return nil, fmt.Errorf("could not read PLC tag listing %s: %s", listingName, goplctag.DecodeError(rc))
	}
	size := int(goplctag.GetSize(handle))
	if size < 4 {
		return nil, fmt.Errorf("PLC tag listing %s returned an unexpectedly small payload", listingName)
	}

	var tags []DiscoveredTag
	offset := 0
	for offset < size {
		tag, nextOffset, err := parseDiscoveredTag(handle, offset, size, parentScope)
		if err != nil {
			return nil, err
		}
		tags = append(tags, tag)
		offset = nextOffset
	}
	return tags, nil
}

func parseDiscoveredTag(handle int32, offset, payloadSize int, parentScope string) (DiscoveredTag, int, error) {
	if offset+22 > payloadSize {
		return DiscoveredTag{}, offset, fmt.Errorf("PLC tag listing entry at offset %d is truncated", offset)
	}

	offset += 4 // instance ID
	rawType := uint16(goplctag.GetUint16(handle, int32(offset)))
	offset += 2
	elementSize := uint16(goplctag.GetUint16(handle, int32(offset)))
	offset += 2

	arrayDims := []int{
		int(goplctag.GetUint32(handle, int32(offset))),
		int(goplctag.GetUint32(handle, int32(offset+4))),
		int(goplctag.GetUint32(handle, int32(offset+8))),
	}
	offset += 12

	stringOffset := offset
	nameLen := int(goplctag.GetStringLength(handle, int32(stringOffset)))
	totalNameLen := int(goplctag.GetStringTotalLength(handle, int32(stringOffset)))
	if nameLen < 0 || totalNameLen < nameLen || stringOffset+totalNameLen > payloadSize {
		return DiscoveredTag{}, offset, fmt.Errorf(
			"PLC tag listing entry has invalid name field at offset %d: length=%d total=%d payload=%d",
			stringOffset,
			nameLen,
			totalNameLen,
			payloadSize,
		)
	}

	var builder strings.Builder
	builder.Grow(nameLen)
	nameStart := stringOffset + 2
	for i := 0; i < nameLen; i++ {
		builder.WriteByte(goplctag.GetUint8(handle, int32(nameStart+i)))
	}
	offset += totalNameLen

	name := builder.String()
	scope := "controller"
	if parentScope != "" {
		scope = parentScope
		name = parentScope + "." + name
	}

	dimCount := int((rawType & tagDimensionMask) >> 13)
	dimensions := make([]int, 0, dimCount)
	elementCount := 1
	for i := 0; i < dimCount && i < len(arrayDims); i++ {
		if arrayDims[i] > 0 {
			dimensions = append(dimensions, arrayDims[i])
			elementCount *= arrayDims[i]
		}
	}

	dataType, watchable, reason := discoveredDataType(rawType)
	return DiscoveredTag{
		Name:              name,
		Scope:             scope,
		DataType:          dataType,
		RawType:           rawType,
		TypeID:            rawType & typeUDTIDMask,
		ElementSize:       elementSize,
		ElementCount:      elementCount,
		Dimensions:        dimensions,
		Watchable:         watchable,
		UnsupportedReason: reason,
	}, offset, nil
}

type udtFieldDefinition struct {
	Name     string
	Type     uint16
	Metadata uint16
	Offset   uint32
}

type udtDefinition struct {
	Name         string
	ID           uint16
	StructHandle uint16
	InstanceSize uint32
	Fields       []udtFieldDefinition
}

func expandStructuredTags(baseAttrs string, tags []DiscoveredTag, timeoutMs int32, progress func(DiscoveryProgress)) ([]DiscoveredTag, map[uint16]string) {
	definitions, schemaErrors := readUDTDefinitions(baseAttrs, tags, timeoutMs, progress)

	var expanded []DiscoveredTag
	for _, tag := range tags {
		if !isStructType(tag.RawType) {
			continue
		}

		udtID := tag.RawType & typeUDTIDMask
		definition := definitions[udtID]
		tagPath := tag.Name
		if len(tag.Dimensions) > 0 {
			tagPath += zeroIndexSelector(len(tag.Dimensions))
		}
		if definition != nil {
			expanded = append(expanded, expandUDTFields(tagPath, tag.Scope, definition, definitions, baseAttrs, timeoutMs, nil)...)
			continue
		}
		dynamicMembers, err := readTagListing(baseAttrs, tagPath+".@tags", tagPath, timeoutMs)
		if err == nil {
			expanded = append(expanded, dynamicMembers...)
		} else if schemaErrors[udtID] == "" {
			schemaErrors[udtID] = fmt.Sprintf("template unavailable and nested member listing failed: %s", err.Error())
		}
	}
	return expanded, schemaErrors
}

func readUDTDefinitions(baseAttrs string, tags []DiscoveredTag, timeoutMs int32, progress func(DiscoveryProgress)) (map[uint16]*udtDefinition, map[uint16]string) {
	definitions := make(map[uint16]*udtDefinition)
	schemaErrors := make(map[uint16]string)
	queued := make(map[uint16]bool)
	var queue []uint16

	enqueue := func(rawType uint16) {
		if !isStructType(rawType) {
			return
		}
		udtID := rawType & typeUDTIDMask
		if queued[udtID] {
			return
		}
		queued[udtID] = true
		queue = append(queue, udtID)
	}

	for _, tag := range tags {
		enqueue(tag.RawType)
	}

	for len(queue) > 0 {
		udtID := queue[0]
		queue = queue[1:]
		if definitions[udtID] != nil {
			continue
		}

		emitDiscoveryProgress(progress, "udt", fmt.Sprintf("Reading UDT template %d", udtID), len(definitions), len(queued))
		definition, err := readUDTDefinition(baseAttrs, udtID, timeoutMs)
		if err != nil {
			schemaErrors[udtID] = err.Error()
			emitDiscoveryProgress(progress, "udt", fmt.Sprintf("Skipped UDT template %d: %s", udtID, err.Error()), len(definitions), len(queued))
			continue
		}
		delete(schemaErrors, udtID)
		definitions[udtID] = definition
		emitDiscoveryProgress(progress, "udt", fmt.Sprintf("Read UDT %s with %d fields", definition.Name, len(definition.Fields)), len(definitions), len(queued))

		for _, field := range definition.Fields {
			enqueue(field.Type)
		}
	}
	return definitions, schemaErrors
}

func countStructuredTags(tags []DiscoveredTag) int {
	count := 0
	for _, tag := range tags {
		if isStructType(tag.RawType) {
			count++
		}
	}
	return count
}

func emitDiscoveryProgress(progress func(DiscoveryProgress), phase, message string, current, total int) {
	if progress == nil {
		return
	}
	progress(DiscoveryProgress{
		Phase:   phase,
		Message: message,
		Current: current,
		Total:   total,
	})
}

func readUDTDefinition(baseAttrs string, udtID uint16, timeoutMs int32) (*udtDefinition, error) {
	listingName := fmt.Sprintf("@udt/%d", udtID)
	handle := goplctag.Create(baseAttrs+listingName, timeoutMs)
	if handle < 0 {
		return nil, fmt.Errorf("could not create PLC UDT listing handle for %s: %s", listingName, goplctag.DecodeError(handle))
	}
	defer goplctag.Destroy(handle)

	if rc := goplctag.Read(handle, timeoutMs); rc != goplctag.StatusOk {
		return nil, fmt.Errorf("could not read PLC UDT listing %s: %s", listingName, goplctag.DecodeError(rc))
	}

	size := int(goplctag.GetSize(handle))
	if size < 14 {
		return nil, fmt.Errorf("PLC UDT listing %s returned an unexpectedly small payload", listingName)
	}

	templateID := uint16(goplctag.GetUint16(handle, 0))
	if templateID != udtID {
		return nil, fmt.Errorf("PLC UDT listing %s returned template ID %d", listingName, templateID)
	}

	instanceSize := uint32(goplctag.GetUint32(handle, 6))
	numFields := int(goplctag.GetUint16(handle, 10))
	structHandle := uint16(goplctag.GetUint16(handle, 12))

	offset := 14
	if offset+(numFields*8) > size {
		return nil, fmt.Errorf("PLC UDT listing %s has truncated field descriptors", listingName)
	}

	fields := make([]udtFieldDefinition, numFields)
	for i := range fields {
		fields[i].Metadata = uint16(goplctag.GetUint16(handle, int32(offset)))
		offset += 2
		fields[i].Type = uint16(goplctag.GetUint16(handle, int32(offset)))
		offset += 2
		fields[i].Offset = uint32(goplctag.GetUint32(handle, int32(offset)))
		offset += 4
	}

	udtName, nextOffset, err := readPLCString(handle, offset, size)
	if err != nil {
		return nil, fmt.Errorf("PLC UDT listing %s has invalid UDT name: %w", listingName, err)
	}
	offset = nextOffset
	if semicolon := strings.IndexByte(udtName, ';'); semicolon >= 0 {
		udtName = udtName[:semicolon]
	}

	for i := range fields {
		if offset >= size {
			break
		}

		fieldName, nextOffset, err := readPLCString(handle, offset, size)
		if err != nil {
			return nil, fmt.Errorf("PLC UDT listing %s has invalid field name %d: %w", listingName, i, err)
		}
		fields[i].Name = fieldName
		offset = nextOffset
	}

	return &udtDefinition{
		Name:         udtName,
		ID:           udtID,
		StructHandle: structHandle,
		InstanceSize: instanceSize,
		Fields:       fields,
	}, nil
}

func readPLCString(handle int32, offset, payloadSize int) (string, int, error) {
	nameLen := int(goplctag.GetStringLength(handle, int32(offset)))
	totalNameLen := int(goplctag.GetStringTotalLength(handle, int32(offset)))
	if nameLen < 0 || totalNameLen < 0 || totalNameLen < nameLen || offset+totalNameLen > payloadSize {
		return "", offset, fmt.Errorf("invalid string at offset %d: length=%d total=%d payload=%d", offset, nameLen, totalNameLen, payloadSize)
	}
	if nameLen == 0 {
		if totalNameLen == 0 {
			totalNameLen = 1
		}
		return "", offset + totalNameLen, nil
	}

	buffer := make([]byte, nameLen+1)
	if rc := goplctag.GetString(handle, int32(offset), buffer, int32(len(buffer))); rc != goplctag.StatusOk {
		return "", offset, fmt.Errorf("could not read string: %s", goplctag.DecodeError(rc))
	}
	return strings.TrimRight(string(buffer), "\x00"), offset + totalNameLen, nil
}

func expandUDTFields(parentPath, parentScope string, definition *udtDefinition, definitions map[uint16]*udtDefinition, baseAttrs string, timeoutMs int32, seen []uint16) []DiscoveredTag {
	if containsUDTID(seen, definition.ID) {
		return nil
	}
	seen = append(seen, definition.ID)

	var expanded []DiscoveredTag
	for _, field := range definition.Fields {
		if field.Name == "" {
			continue
		}

		fieldPath := parentPath + "." + field.Name
		if isStructType(field.Type) {
			child := definitions[field.Type&typeUDTIDMask]
			if field.Type&fieldArrayMask != 0 {
				fieldPath += "[0]"
			}
			if child != nil {
				expanded = append(expanded, expandUDTFields(fieldPath, udtScope(parentScope, definition), child, definitions, baseAttrs, timeoutMs, seen)...)
			}
			continue
		}

		dataType, watchable, reason := discoveredDataType(field.Type)
		elementCount := 1
		var dimensions []int
		if field.Type&fieldArrayMask != 0 && field.Metadata > 0 {
			elementCount = int(field.Metadata)
			dimensions = []int{elementCount}
		}

		elementSize := uint16(0)
		if dataType != "" {
			elementSize = uint16(ElementSize(dataType))
		}

		expanded = append(expanded, DiscoveredTag{
			Name:              fieldPath,
			Scope:             udtScope(parentScope, definition),
			DataType:          dataType,
			RawType:           field.Type,
			TypeID:            field.Type & typeUDTIDMask,
			ElementSize:       elementSize,
			ElementCount:      elementCount,
			Dimensions:        dimensions,
			Watchable:         watchable,
			UnsupportedReason: reason,
		})
	}
	return expanded
}

func isStructType(rawType uint16) bool {
	return rawType&typeIsStruct != 0
}

func containsUDTID(ids []uint16, target uint16) bool {
	for _, id := range ids {
		if id == target {
			return true
		}
	}
	return false
}

func udtScope(parentScope string, definition *udtDefinition) string {
	if definition.Name == "" {
		return parentScope + " / UDT"
	}
	return parentScope + " / UDT " + definition.Name
}

func zeroIndexSelector(dimensions int) string {
	if dimensions <= 0 {
		return ""
	}

	parts := make([]string, dimensions)
	for i := range parts {
		parts[i] = "0"
	}
	return "[" + strings.Join(parts, ",") + "]"
}

func discoveredDataType(rawType uint16) (TagDataType, bool, string) {
	if rawType&typeIsStruct != 0 {
		return TagStruct, true, ""
	}
	if rawType&typeIsSystem != 0 {
		return "", false, "system tag"
	}

	switch rawType & atomicTypeMask {
	case 0xC1:
		return TagBool, true, ""
	case 0xC2:
		return TagSint, true, ""
	case 0xC3:
		return TagInt, true, ""
	case 0xC4:
		return TagDint, true, ""
	case 0xC5:
		return TagLint, true, ""
	case 0xCA:
		return TagReal, true, ""
	case 0xD0:
		return TagString, true, ""
	default:
		return "", false, fmt.Sprintf("unsupported Logix type 0x%04x", rawType)
	}
}

const (
	typeIsStruct     uint16 = 0x8000
	typeIsSystem     uint16 = 0x1000
	tagDimensionMask uint16 = 0x6000
	atomicTypeMask   uint16 = 0x00FF
	typeUDTIDMask    uint16 = 0x0FFF
	fieldArrayMask   uint16 = 0x2000
)

func createHandle(config ConnectionConfig, tag WatchedTag) (int32, error) {
	count := tag.ElementCount
	if count <= 0 {
		count = 1
	}
	attrs := []string{
		"protocol=ab_eip",
		"gateway=" + config.Address,
		"path=" + config.Path,
		"plc=controllogix",
		"elem_count=" + strconv.Itoa(count),
		"name=" + tag.Name,
	}
	if tag.DataType != TagString || tag.ElementSize > 0 {
		attrs = append(attrs, "elem_size="+strconv.Itoa(ElementSizeForTag(tag)))
	}

	handle := goplctag.Create(strings.Join(attrs, "&"), int32(config.TimeoutMs))
	if handle < 0 {
		return 0, fmt.Errorf("could not create PLC tag handle: %s", goplctag.DecodeError(handle))
	}
	if rc := goplctag.Status(handle); rc != goplctag.StatusOk {
		goplctag.Destroy(handle)
		return 0, fmt.Errorf("PLC tag status error: %s", goplctag.DecodeError(rc))
	}
	return handle, nil
}

func readValue(handle int32, tag WatchedTag) (any, error) {
	count := tag.ElementCount
	if tag.DataType == TagString {
		return readStringValue(handle, count)
	}
	if count <= 1 {
		return readScalar(handle, tag.DataType, 0)
	}

	values := make([]any, 0, count)
	size := int32(ElementSizeForTag(tag))
	for i := 0; i < count; i++ {
		offset := int32(i) * size
		if tag.DataType == TagBool {
			offset = int32(i)
		}
		value, err := readScalar(handle, tag.DataType, offset)
		if err != nil {
			return nil, err
		}
		values = append(values, value)
	}
	return values, nil
}

func readScalar(handle int32, dataType TagDataType, offset int32) (any, error) {
	switch dataType {
	case TagBool:
		return goplctag.GetBit(handle, offset) > 0, nil
	case TagSint:
		return goplctag.GetInt8(handle, offset), nil
	case TagInt:
		return goplctag.GetInt16(handle, offset), nil
	case TagDint:
		return goplctag.GetInt32(handle, offset), nil
	case TagLint:
		return int64(goplctag.GetInt64(handle, offset)), nil
	case TagReal:
		return float64(goplctag.GetFloat32(handle, offset)), nil
	case TagString:
		return readStringAt(handle, offset)
	case TagStruct:
		return readStructPayload(handle), nil
	default:
		return nil, fmt.Errorf("unsupported tag type %q", dataType)
	}
}

func readStringValue(handle int32, count int) (any, error) {
	if count <= 1 {
		return readStringAt(handle, 0)
	}

	values := make([]any, 0, count)
	offset := int32(0)
	for i := 0; i < count; i++ {
		value, err := readStringAt(handle, offset)
		if err != nil {
			return nil, err
		}
		values = append(values, value)

		totalLength := goplctag.GetStringTotalLength(handle, offset)
		if totalLength <= 0 {
			totalLength = int32(standardLogixStringSize)
		}
		offset += totalLength
	}
	return values, nil
}

func readStringAt(handle int32, offset int32) (string, error) {
	length := goplctag.GetStringLength(handle, offset)
	if length < 0 {
		return "", fmt.Errorf("could not read STRING length: %s", goplctag.DecodeError(length))
	}

	capacity := goplctag.GetStringCapacity(handle, offset)
	if capacity < 0 {
		return "", fmt.Errorf("could not read STRING capacity: %s", goplctag.DecodeError(capacity))
	}
	if length > capacity {
		return "", fmt.Errorf("STRING length %d exceeds capacity %d", length, capacity)
	}

	dataOffset := offset + standardLogixStringCountBytes
	bytes := make([]byte, length)
	for i := int32(0); i < length; i++ {
		bytes[int(i)] = goplctag.GetUint8(handle, dataOffset+i)
	}
	return string(bytes), nil
}

func readStructPayload(handle int32) map[string]any {
	size := int(goplctag.GetSize(handle))
	limit := size
	truncated := false
	if limit > maxStructPreviewBytes {
		limit = maxStructPreviewBytes
		truncated = true
	}

	bytes := make([]byte, limit)
	for i := 0; i < limit; i++ {
		bytes[i] = goplctag.GetUint8(handle, int32(i))
	}

	return map[string]any{
		"byteLength": size,
		"previewHex": hex.EncodeToString(bytes),
		"truncated":  truncated,
	}
}

func setValue(handle int32, tag WatchedTag, value any) error {
	if tag.ElementCount > 1 {
		return fmt.Errorf("array writes are not supported in v0.1")
	}
	switch tag.DataType {
	case TagBool:
		v := int32(0)
		if value.(bool) {
			v = 1
		}
		if rc := goplctag.SetBit(handle, 0, v); rc != goplctag.StatusOk {
			return fmt.Errorf("set BOOL failed: %s", goplctag.DecodeError(rc))
		}
	case TagSint:
		if rc := goplctag.SetInt8(handle, 0, value.(int8)); rc != goplctag.StatusOk {
			return fmt.Errorf("set SINT failed: %s", goplctag.DecodeError(rc))
		}
	case TagInt:
		if rc := goplctag.SetInt16(handle, 0, value.(int16)); rc != goplctag.StatusOk {
			return fmt.Errorf("set INT failed: %s", goplctag.DecodeError(rc))
		}
	case TagDint:
		if rc := goplctag.SetInt32(handle, 0, value.(int32)); rc != goplctag.StatusOk {
			return fmt.Errorf("set DINT failed: %s", goplctag.DecodeError(rc))
		}
	case TagLint:
		v := value.(int64)
		if v < mathMinInt32 || v > mathMaxInt32 {
			return fmt.Errorf("LINT writes are limited by goplctag v1.0.3 bindings to 32-bit values")
		}
		if rc := goplctag.SetInt64(handle, 0, int32(v)); rc != goplctag.StatusOk {
			return fmt.Errorf("set LINT failed: %s", goplctag.DecodeError(rc))
		}
	case TagReal:
		if rc := goplctag.SetFloat32(handle, 0, float32(value.(float64))); rc != goplctag.StatusOk {
			return fmt.Errorf("set REAL failed: %s", goplctag.DecodeError(rc))
		}
	case TagString:
		if rc := goplctag.SetString(handle, 0, value.(string)); rc != goplctag.StatusOk {
			return fmt.Errorf("set STRING failed: %s", goplctag.DecodeError(rc))
		}
	case TagStruct:
		return fmt.Errorf("STRUCT tags are read-only")
	default:
		return fmt.Errorf("unsupported tag type %q", tag.DataType)
	}
	return nil
}

func timeout(ms int) time.Duration {
	if ms <= 0 {
		ms = 5000
	}
	return time.Duration(ms) * time.Millisecond
}

const (
	mathMinInt32                  = -2147483648
	mathMaxInt32                  = 2147483647
	maxStructPreviewBytes         = 4096
	standardLogixStringCountBytes = 4
)
