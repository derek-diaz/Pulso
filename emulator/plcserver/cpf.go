package plcserver

func (s *Server) handleCPFUnconnected(body []byte, session *sessionState) ([]byte, bool) {
	if len(body) < 16 || le.Uint16(body[6:8]) != 2 {
		return nil, false
	}
	if le.Uint16(body[8:10]) != 0x0000 || le.Uint16(body[12:14]) != 0x00B2 {
		return nil, false
	}
	size := int(le.Uint16(body[14:16]))
	if len(body) < 16+size {
		return nil, false
	}
	resp := s.handleCIPUnconnected(body[16:16+size], session)
	out := make([]byte, 16+len(resp))
	copy(out[0:8], body[0:8])
	le.PutUint16(out[8:10], 0x0000)
	le.PutUint16(out[10:12], 0)
	le.PutUint16(out[12:14], 0x00B2)
	le.PutUint16(out[14:16], uint16(len(resp)))
	copy(out[16:], resp)
	return out, true
}

func (s *Server) handleCPFConnected(body []byte, session *sessionState) ([]byte, bool) {
	if len(body) < 22 || le.Uint16(body[6:8]) != 2 {
		return nil, false
	}
	if le.Uint16(body[8:10]) != 0x00A1 || le.Uint16(body[16:18]) != 0x00B1 {
		return nil, false
	}
	size := int(le.Uint16(body[18:20]))
	if len(body) < 20+size || size < 2 {
		return nil, false
	}
	seq := le.Uint16(body[20:22])
	resp := s.handleCIP(body[22:20+size], session)
	out := make([]byte, 22+len(resp))
	copy(out[0:8], body[0:8])
	le.PutUint16(out[8:10], 0x00A1)
	le.PutUint16(out[10:12], 4)
	le.PutUint32(out[12:16], session.clientCID)
	le.PutUint16(out[16:18], 0x00B1)
	le.PutUint16(out[18:20], uint16(len(resp)+2))
	le.PutUint16(out[20:22], seq)
	copy(out[22:], resp)
	return out, true
}
