package plcserver

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
)

var le = binary.LittleEndian

func cipType(name string) (uint16, int, error) {
	switch strings.ToUpper(strings.TrimSpace(name)) {
	case "BOOL":
		return typeBool, 1, nil
	case "SINT":
		return typeSint, 1, nil
	case "INT":
		return typeInt, 2, nil
	case "DINT":
		return typeDint, 4, nil
	case "LINT":
		return typeLint, 8, nil
	case "REAL":
		return typeReal, 4, nil
	case "STRING":
		return typeString, 88, nil
	default:
		return 0, 0, fmt.Errorf("unsupported tag type %q", name)
	}
}

func encodeInitialValue(typ uint16, elemSize int, elemCount uint32, raw any) ([]byte, float64, error) {
	data := make([]byte, int(elemCount)*elemSize)
	values := []any{raw}
	if array, ok := raw.([]any); ok {
		values = array
	}
	var base float64
	for i := uint32(0); i < elemCount; i++ {
		var value any
		if int(i) < len(values) {
			value = values[i]
		}
		offset := int(i) * elemSize
		if err := encodeValue(data[offset:offset+elemSize], typ, value); err != nil {
			return nil, 0, err
		}
		if i == 0 && typ == typeReal {
			base = float64(math.Float32frombits(le.Uint32(data[offset : offset+4])))
		}
	}
	return data, base, nil
}

func encodeValue(dst []byte, typ uint16, raw any) error {
	switch typ {
	case typeBool:
		v, err := asBool(raw)
		if err != nil {
			return err
		}
		if v {
			dst[0] = 1
		}
	case typeSint:
		v, err := asInt(raw)
		if err != nil {
			return err
		}
		dst[0] = byte(int8(v))
	case typeInt:
		v, err := asInt(raw)
		if err != nil {
			return err
		}
		le.PutUint16(dst, uint16(int16(v)))
	case typeDint:
		v, err := asInt(raw)
		if err != nil {
			return err
		}
		le.PutUint32(dst, uint32(int32(v)))
	case typeLint:
		v, err := asInt(raw)
		if err != nil {
			return err
		}
		le.PutUint64(dst, uint64(v))
	case typeReal:
		v, err := asFloat(raw)
		if err != nil {
			return err
		}
		le.PutUint32(dst, math.Float32bits(float32(v)))
	case typeString:
		s := fmt.Sprintf("%v", raw)
		if raw == nil {
			s = ""
		}
		if len(s) > 82 {
			s = s[:82]
		}
		le.PutUint32(dst[0:4], uint32(len(s)))
		copy(dst[4:], s)
	default:
		return fmt.Errorf("unsupported CIP type 0x%04x", typ)
	}
	return nil
}

func encodeSymbol(symbol *Symbol) []byte {
	name := []byte(symbol.Name)
	out := make([]byte, 4+2+2+12+2+len(name))
	le.PutUint32(out[0:4], symbol.InstanceID)
	le.PutUint16(out[4:6], symbol.Type)
	le.PutUint16(out[6:8], symbol.ElementLen)
	le.PutUint32(out[8:12], symbol.Dimensions[0])
	le.PutUint32(out[12:16], symbol.Dimensions[1])
	le.PutUint32(out[16:20], symbol.Dimensions[2])
	le.PutUint16(out[20:22], uint16(len(name)))
	copy(out[22:], name)
	return out
}

func encodeUDTPayload(def *UDTDef) []byte {
	var out []byte
	for _, field := range def.Fields {
		chunk := make([]byte, 8)
		le.PutUint16(chunk[0:2], field.Metadata)
		le.PutUint16(chunk[2:4], field.Type)
		le.PutUint32(chunk[4:8], field.Offset)
		out = append(out, chunk...)
	}
	out = append(out, encodeUDTString(def.Name)...)
	for _, field := range def.Fields {
		out = append(out, encodeUDTString(field.Name)...)
	}
	return out
}

func encodeUDTString(value string) []byte {
	data := []byte(value)
	out := make([]byte, len(data)+1)
	copy(out, data)
	return out
}

func encodePortPath(path string) []byte {
	parts := strings.Split(path, ",")
	var out []byte
	for _, part := range parts {
		n, err := strconv.Atoi(strings.TrimSpace(part))
		if err != nil {
			continue
		}
		out = append(out, byte(n))
	}
	if len(out)%2 != 0 {
		out = append(out, 0)
	}
	return out
}

func asBool(raw any) (bool, error) {
	switch v := raw.(type) {
	case bool:
		return v, nil
	case float64:
		return v != 0, nil
	case string:
		switch strings.ToLower(strings.TrimSpace(v)) {
		case "true", "1", "on", "yes":
			return true, nil
		case "false", "0", "off", "no", "":
			return false, nil
		}
	case json.Number:
		n, err := v.Int64()
		return n != 0, err
	}
	return false, fmt.Errorf("cannot encode %v as BOOL", raw)
}

func asInt(raw any) (int64, error) {
	switch v := raw.(type) {
	case nil:
		return 0, nil
	case float64:
		return int64(v), nil
	case int:
		return int64(v), nil
	case int64:
		return v, nil
	case string:
		return strconv.ParseInt(strings.TrimSpace(v), 10, 64)
	case json.Number:
		return v.Int64()
	default:
		return 0, fmt.Errorf("cannot encode %v as integer", raw)
	}
}

func asFloat(raw any) (float64, error) {
	switch v := raw.(type) {
	case nil:
		return 0, nil
	case float64:
		return v, nil
	case int:
		return float64(v), nil
	case int64:
		return float64(v), nil
	case string:
		return strconv.ParseFloat(strings.TrimSpace(v), 64)
	case json.Number:
		return v.Float64()
	default:
		return 0, fmt.Errorf("cannot encode %v as REAL", raw)
	}
}
