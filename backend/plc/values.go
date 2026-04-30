package plc

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
)

func NormalizeValue(dataType TagDataType, value any) (any, error) {
	switch dataType {
	case TagBool:
		return parseBool(value)
	case TagSint:
		v, err := parseInt(value, math.MinInt8, math.MaxInt8)
		return int8(v), err
	case TagInt:
		v, err := parseInt(value, math.MinInt16, math.MaxInt16)
		return int16(v), err
	case TagDint:
		v, err := parseInt(value, math.MinInt32, math.MaxInt32)
		return int32(v), err
	case TagLint:
		return parseInt(value, math.MinInt64, math.MaxInt64)
	case TagReal:
		return parseFloat(value)
	case TagString:
		if s, ok := value.(string); ok {
			return s, nil
		}
		return fmt.Sprintf("%v", value), nil
	case TagStruct:
		return nil, fmt.Errorf("STRUCT tags are read-only")
	default:
		return nil, fmt.Errorf("unsupported tag type %q", dataType)
	}
}

func ElementSize(dataType TagDataType) int {
	switch dataType {
	case TagBool, TagSint:
		return 1
	case TagInt:
		return 2
	case TagDint, TagReal:
		return 4
	case TagLint:
		return 8
	case TagString:
		return standardLogixStringSize
	default:
		return 1
	}
}

func ElementSizeForTag(tag WatchedTag) int {
	if tag.DataType == TagStruct && tag.ElementSize > 0 {
		return tag.ElementSize
	}
	return ElementSize(tag.DataType)
}

const standardLogixStringSize = 88

func parseBool(value any) (bool, error) {
	switch v := value.(type) {
	case bool:
		return v, nil
	case string:
		switch strings.ToLower(strings.TrimSpace(v)) {
		case "true", "1", "on", "yes":
			return true, nil
		case "false", "0", "off", "no":
			return false, nil
		}
	case float64:
		return v != 0, nil
	case int:
		return v != 0, nil
	case json.Number:
		n, err := v.Int64()
		return n != 0, err
	}
	return false, fmt.Errorf("cannot parse %v as BOOL", value)
}

func parseInt(value any, min, max int64) (int64, error) {
	var parsed int64
	switch v := value.(type) {
	case string:
		n, err := strconv.ParseInt(strings.TrimSpace(v), 10, 64)
		if err != nil {
			return 0, err
		}
		parsed = n
	case float64:
		if math.Trunc(v) != v {
			return 0, fmt.Errorf("expected integer, got %v", value)
		}
		parsed = int64(v)
	case int:
		parsed = int64(v)
	case int8:
		parsed = int64(v)
	case int16:
		parsed = int64(v)
	case int32:
		parsed = int64(v)
	case int64:
		parsed = v
	case json.Number:
		n, err := v.Int64()
		if err != nil {
			return 0, err
		}
		parsed = n
	default:
		return 0, fmt.Errorf("cannot parse %v as integer", value)
	}
	if parsed < min || parsed > max {
		return 0, fmt.Errorf("value %d outside allowed range %d..%d", parsed, min, max)
	}
	return parsed, nil
}

func parseFloat(value any) (float64, error) {
	switch v := value.(type) {
	case string:
		return strconv.ParseFloat(strings.TrimSpace(v), 64)
	case float64:
		return v, nil
	case float32:
		return float64(v), nil
	case int:
		return float64(v), nil
	case int8:
		return float64(v), nil
	case int16:
		return float64(v), nil
	case int32:
		return float64(v), nil
	case int64:
		return float64(v), nil
	case json.Number:
		return v.Float64()
	default:
		return 0, fmt.Errorf("cannot parse %v as REAL", value)
	}
}
