//go:build libplctag

package plc

import (
	"context"
	"net"
	"testing"
	"time"

	"Pulso/emulator/plcserver"
)

func TestReadUDTDefinitionFromPulsoEmulator(t *testing.T) {
	address := startUDTTestServer(t)
	baseAttrs := "protocol=ab-eip&gateway=" + address + "&path=1,0&plc=ControlLogix&name="
	for _, id := range []uint16{1, 2} {
		def, err := readUDTDefinition(baseAttrs, id, 2000)
		if err != nil {
			t.Fatalf("read UDT definition %d: %v", id, err)
		}
		if def.Name == "" {
			t.Fatalf("definition %d name is empty", id)
		}
		if len(def.Fields) == 0 {
			t.Fatalf("definition %d has no fields", id)
		}
		for _, field := range def.Fields {
			if field.Name == "" {
				t.Fatalf("definition %d has empty field name: %+v", id, field)
			}
		}
	}
}

func startUDTTestServer(t *testing.T) string {
	t.Helper()
	profile, err := plcserver.LoadProfile("../../emulator/profiles/sample-logix.json")
	if err != nil {
		t.Fatalf("load profile: %v", err)
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("reserve listen port: %v", err)
	}
	address := listener.Addr().String()
	_ = listener.Close()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	server := &plcserver.Server{PLC: profile, Addr: address}
	errCh := make(chan error, 1)
	go func() { errCh <- server.ListenAndServe(ctx) }()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("tcp", address, 50*time.Millisecond)
		if err == nil {
			_ = conn.Close()
			return address
		}
		select {
		case err := <-errCh:
			t.Fatalf("server exited: %v", err)
		default:
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("server did not start")
	return ""
}
