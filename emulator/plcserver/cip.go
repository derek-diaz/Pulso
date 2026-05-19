package plcserver

import "bytes"

const (
	cipOK             byte = 0x00
	cipFrag           byte = 0x06
	cipUnsupported    byte = 0x08
	cipInvalidParam   byte = 0x03
	cipPathUnknown    byte = 0x05
	cipTooMuchData    byte = 0x15
	serviceMulti      byte = 0x0A
	serviceRead       byte = 0x4C
	serviceWrite      byte = 0x4D
	serviceForwardCls byte = 0x4E
	serviceReadFrag   byte = 0x52
	serviceUnconnSend byte = 0x52
	serviceWriteFrag  byte = 0x53
	serviceForwardOpn byte = 0x54
	serviceList       byte = 0x55
	serviceForwardEx  byte = 0x5B
)

func (s *Server) handleCIPUnconnected(packet []byte, session *sessionState) []byte {
	service, path, payload, ok := parseCIP(packet)
	if !ok {
		return cipError(0, cipInvalidParam)
	}
	switch service {
	case serviceForwardOpn, serviceForwardEx:
		return s.forwardOpen(service, path, payload, session)
	case serviceForwardCls:
		return cipSuccess(service, []byte{0, 0, 0, 0, 0, 0, 0, 0})
	case serviceUnconnSend:
		if len(payload) < 4 {
			return cipError(service, cipInvalidParam)
		}
		embeddedLen := int(le.Uint16(payload[2:4]))
		if len(payload) < 4+embeddedLen {
			return cipError(service, cipInvalidParam)
		}
		return s.handleCIP(payload[4:4+embeddedLen], session)
	default:
		return cipError(service, cipUnsupported)
	}
}

func (s *Server) handleCIP(packet []byte, session *sessionState) []byte {
	service, path, payload, ok := parseCIP(packet)
	if !ok {
		return cipError(0, cipInvalidParam)
	}
	switch service {
	case serviceMulti:
		return s.multi(service, payload, session)
	case 0x03:
		return s.getAttrList(service, path)
	case serviceRead, serviceReadFrag:
		return s.read(service, path, payload)
	case serviceWrite, serviceWriteFrag:
		return s.write(service, path, payload)
	case serviceList:
		return s.list(service, path, payload, session)
	default:
		return cipError(service, cipUnsupported)
	}
}

func (s *Server) forwardOpen(service byte, path, payload []byte, session *sessionState) []byte {
	if !bytes.Equal(path, []byte{0x20, 0x06, 0x24, 0x01}) {
		return cipError(service, cipUnsupported)
	}
	if len(payload) < 42 {
		return cipError(service, cipInvalidParam)
	}
	session.clientCID = le.Uint32(payload[8:12])
	session.serverCID++
	if service == serviceForwardEx && len(payload) >= 46 {
		session.maxPayload = int(le.Uint32(payload[30:34]) & 0x0FFF)
	} else {
		session.maxPayload = int(le.Uint16(payload[26:28]) & 0x01FF)
	}
	if session.maxPayload < 128 {
		session.maxPayload = 4000
	}
	out := make([]byte, 26)
	le.PutUint32(out[0:4], session.serverCID)
	le.PutUint32(out[4:8], session.clientCID)
	copy(out[8:18], payload[12:22])
	copy(out[18:22], payload[22:26])
	if service == serviceForwardEx && len(payload) >= 46 {
		copy(out[22:26], payload[34:38])
	} else {
		copy(out[22:26], payload[28:32])
	}
	return cipSuccess(service, out)
}

func (s *Server) read(service byte, path, payload []byte) []byte {
	if isUDTPath(path) {
		return s.readUDT(service, path, payload)
	}
	name, ok := parseSymbolPath(path)
	if !ok || len(payload) < 2 {
		return cipError(service, cipInvalidParam)
	}
	count := le.Uint16(payload[0:2])
	offset := uint32(0)
	if service == serviceReadFrag {
		if len(payload) < 6 {
			return cipError(service, cipInvalidParam)
		}
		offset = le.Uint32(payload[2:6])
	}
	typ, data, ok := s.PLC.Read(name, count, offset)
	if !ok {
		return cipError(service, cipPathUnknown)
	}
	out := make([]byte, 2+len(data))
	le.PutUint16(out[0:2], typ)
	copy(out[2:], data)
	return cipSuccess(service, out)
}

func (s *Server) getAttrList(service byte, path []byte) []byte {
	id, ok := parseUDTPath(path)
	if !ok {
		return cipError(service, cipUnsupported)
	}
	def, ok := s.PLC.UDT(id)
	if !ok {
		return cipError(service, cipPathUnknown)
	}
	out := make([]byte, 30)
	le.PutUint16(out[0:2], 4)
	le.PutUint16(out[2:4], 4)
	le.PutUint16(out[4:6], 0)
	le.PutUint32(out[6:10], def.WordSize)
	le.PutUint16(out[10:12], 5)
	le.PutUint16(out[12:14], 0)
	le.PutUint32(out[14:18], def.InstanceSize)
	le.PutUint16(out[18:20], 2)
	le.PutUint16(out[20:22], 0)
	le.PutUint16(out[22:24], uint16(len(def.Fields)))
	le.PutUint16(out[24:26], 1)
	le.PutUint16(out[26:28], 0)
	le.PutUint16(out[28:30], def.Handle)
	return cipSuccess(service, out)
}

func (s *Server) readUDT(service byte, path, payload []byte) []byte {
	id, ok := parseUDTPath(path)
	if !ok || len(payload) < 6 {
		return cipError(service, cipInvalidParam)
	}
	def, ok := s.PLC.UDT(id)
	if !ok {
		return cipError(service, cipPathUnknown)
	}
	offset := int(le.Uint32(payload[0:4]))
	size := int(le.Uint16(payload[4:6]))
	if offset < 0 || offset > len(def.Payload) {
		return cipError(service, cipInvalidParam)
	}
	end := offset + size
	if end > len(def.Payload) {
		end = len(def.Payload)
	}
	return cipSuccess(service, def.Payload[offset:end])
}

func (s *Server) write(service byte, path, payload []byte) []byte {
	name, ok := parseSymbolPath(path)
	if !ok || len(payload) < 4 {
		return cipError(service, cipInvalidParam)
	}
	typ := le.Uint16(payload[0:2])
	count := le.Uint16(payload[2:4])
	offset := uint32(0)
	dataStart := 4
	if service == serviceWriteFrag {
		if len(payload) < 8 {
			return cipError(service, cipInvalidParam)
		}
		offset = le.Uint32(payload[4:8])
		dataStart = 8
	}
	if !s.PLC.Write(name, typ, count, offset, payload[dataStart:]) {
		return cipError(service, cipInvalidParam)
	}
	return cipSuccess(service, nil)
}

func (s *Server) list(service byte, path, payload []byte, session *sessionState) []byte {
	scope, _ := parseListScope(path)
	if len(payload) < 2 {
		return cipError(service, cipInvalidParam)
	}
	after := uint32(le.Uint16(path[len(path)-2:]))
	limit := session.maxPayload - 64
	if limit <= 0 {
		limit = 400
	}
	data, fragmented := s.PLC.List(scope, after, limit)
	status := cipOK
	if fragmented {
		status = cipFrag
	}
	return cipResponse(service, status, data)
}

func (s *Server) multi(service byte, payload []byte, session *sessionState) []byte {
	if len(payload) < 2 {
		return cipError(service, cipInvalidParam)
	}
	count := int(le.Uint16(payload[0:2]))
	if len(payload) < 2+count*2 {
		return cipError(service, cipInvalidParam)
	}
	responses := make([][]byte, 0, count)
	for i := 0; i < count; i++ {
		start := int(le.Uint16(payload[2+i*2 : 4+i*2]))
		end := len(payload)
		if i+1 < count {
			end = int(le.Uint16(payload[4+i*2 : 6+i*2]))
		}
		if start < 0 || start >= end || end > len(payload) {
			return cipError(service, cipInvalidParam)
		}
		responses = append(responses, s.handleCIP(payload[start:end], session))
	}
	size := 2 + count*2
	for _, resp := range responses {
		size += len(resp)
	}
	out := make([]byte, 4+size)
	out[0] = service | 0x80
	le.PutUint16(out[4:6], uint16(count))
	offset := 2 + count*2
	for i, resp := range responses {
		le.PutUint16(out[6+i*2:8+i*2], uint16(offset))
		copy(out[4+offset:], resp)
		offset += len(resp)
	}
	return out
}

func parseCIP(packet []byte) (byte, []byte, []byte, bool) {
	if len(packet) < 2 {
		return 0, nil, nil, false
	}
	service := packet[0]
	words := int(packet[1])
	pathBytes := words * 2
	if len(packet) < 2+pathBytes {
		return service, nil, nil, false
	}
	return service, packet[2 : 2+pathBytes], packet[2+pathBytes:], true
}

func cipSuccess(service byte, payload []byte) []byte {
	return cipResponse(service, cipOK, payload)
}

func cipError(service, status byte) []byte {
	return cipResponse(service, status, nil)
}

func cipResponse(service, status byte, payload []byte) []byte {
	out := make([]byte, 4+len(payload))
	out[0] = service | 0x80
	out[2] = status
	copy(out[4:], payload)
	return out
}
