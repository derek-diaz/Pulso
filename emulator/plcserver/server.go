package plcserver

import (
	"context"
	"fmt"
	"io"
	"log"
	"net"
	"strings"
	"sync/atomic"
)

type Server struct {
	PLC     *PLC
	Addr    string
	Logger  *log.Logger
	nextSID atomic.Uint32
}

func (s *Server) ListenAndServe(ctx context.Context) error {
	if s.PLC == nil {
		return fmt.Errorf("PLC profile is required")
	}
	addr := s.Addr
	if strings.TrimSpace(addr) == "" {
		addr = "127.0.0.1:44818"
	}
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	defer listener.Close()
	s.logf("pulso PLC emulator listening on %s", listener.Addr())
	go func() {
		<-ctx.Done()
		_ = listener.Close()
	}()
	for {
		conn, err := listener.Accept()
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			return err
		}
		go s.handleConn(conn)
	}
}

func (s *Server) handleConn(conn net.Conn) {
	defer conn.Close()
	session := &sessionState{
		handle:     s.nextSession(),
		serverCID:  0x20000001,
		maxPayload: 4000,
	}
	for {
		header := make([]byte, 24)
		if _, err := io.ReadFull(conn, header); err != nil {
			return
		}
		length := int(le.Uint16(header[2:4]))
		body := make([]byte, length)
		if _, err := io.ReadFull(conn, body); err != nil {
			return
		}
		resp, closeConn := s.dispatch(header, body, session)
		if len(resp) > 0 {
			if _, err := conn.Write(resp); err != nil {
				return
			}
		}
		if closeConn {
			return
		}
	}
}

func (s *Server) dispatch(header, body []byte, session *sessionState) ([]byte, bool) {
	command := le.Uint16(header[0:2])
	senderContext := header[12:20]
	options := le.Uint32(header[20:24])
	switch command {
	case 0x0065:
		payload := []byte{1, 0, 0, 0}
		return eipResponse(command, session.handle, senderContext, options, payload, 0), false
	case 0x0066:
		return nil, true
	case 0x006F:
		payload, ok := s.handleCPFUnconnected(body, session)
		if !ok {
			return eipResponse(command, session.handle, senderContext, options, nil, 1), false
		}
		return eipResponse(command, session.handle, senderContext, options, payload, 0), false
	case 0x0070:
		payload, ok := s.handleCPFConnected(body, session)
		if !ok {
			return eipResponse(command, session.handle, senderContext, options, nil, 1), false
		}
		return eipResponse(command, session.handle, senderContext, options, payload, 0), false
	default:
		return eipResponse(command, session.handle, senderContext, options, nil, 1), false
	}
}

func (s *Server) nextSession() uint32 {
	next := s.nextSID.Add(1)
	if next == 0 {
		next = s.nextSID.Add(1)
	}
	return next
}

func (s *Server) logf(format string, args ...any) {
	if s.Logger != nil {
		s.Logger.Printf(format, args...)
	}
}

func eipResponse(command uint16, session uint32, senderContext []byte, options uint32, payload []byte, status uint32) []byte {
	out := make([]byte, 24+len(payload))
	le.PutUint16(out[0:2], command)
	le.PutUint16(out[2:4], uint16(len(payload)))
	le.PutUint32(out[4:8], session)
	le.PutUint32(out[8:12], status)
	copy(out[12:20], senderContext)
	le.PutUint32(out[20:24], options)
	copy(out[24:], payload)
	return out
}

type sessionState struct {
	handle     uint32
	serverCID  uint32
	clientCID  uint32
	seq        uint16
	maxPayload int
}
