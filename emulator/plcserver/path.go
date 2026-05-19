package plcserver

import "strings"

func parseSymbolPath(path []byte) (string, bool) {
	var parts []string
	for offset := 0; offset < len(path); {
		switch path[offset] {
		case 0x91:
			if offset+2 > len(path) {
				return "", false
			}
			n := int(path[offset+1])
			start := offset + 2
			end := start + n
			if end > len(path) {
				return "", false
			}
			parts = append(parts, string(path[start:end]))
			offset = end
			if offset%2 != 0 {
				offset++
			}
		case 0x28:
			offset += 2
		case 0x29:
			offset += 4
		case 0x2A:
			offset += 6
		default:
			return "", false
		}
	}
	if len(parts) == 0 {
		return "", false
	}
	return strings.Join(parts, "."), true
}

func parseListScope(path []byte) (string, bool) {
	var parts []string
	offset := 0
	for offset < len(path) {
		if path[offset] == 0x20 {
			break
		}
		if path[offset] != 0x91 || offset+2 > len(path) {
			return "", false
		}
		n := int(path[offset+1])
		start := offset + 2
		end := start + n
		if end > len(path) {
			return "", false
		}
		parts = append(parts, string(path[start:end]))
		offset = end
		if offset%2 != 0 {
			offset++
		}
	}
	if len(parts) == 0 {
		return "", true
	}
	name := strings.Join(parts, ".")
	name = strings.TrimSuffix(name, ".@tags")
	if name == "@tags" {
		return "", true
	}
	return name, true
}

func isUDTPath(path []byte) bool {
	_, ok := parseUDTPath(path)
	return ok
}

func parseUDTPath(path []byte) (uint16, bool) {
	if len(path) != 6 {
		return 0, false
	}
	if path[0] != 0x20 || path[1] != 0x6C || path[2] != 0x25 {
		return 0, false
	}
	return le.Uint16(path[4:6]), true
}
