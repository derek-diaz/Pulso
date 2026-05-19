//go:build libplctag

package plcserver_test

import (
	"context"
	"net"
	"testing"
	"time"

	"Pulso/backend/plc"
	"Pulso/emulator/plcserver"
)

func TestEmulatorWorksWithGoPLCClient(t *testing.T) {
	address := startTestServer(t)
	client := plc.NewGoPLCClient()
	config := plc.ConnectionConfig{
		Address:   address,
		Path:      "1,0",
		TimeoutMs: 2000,
	}
	if err := client.Connect(config); err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(func() { _ = client.Disconnect() })

	value, err := client.Read(plc.WatchedTag{Name: "PartCount", DataType: plc.TagDint, ElementCount: 1})
	if err != nil {
		t.Fatalf("read PartCount: %v", err)
	}
	if _, ok := value.(int32); !ok {
		t.Fatalf("PartCount type = %T, want int32", value)
	}

	tag := plc.WatchedTag{Name: "Motor_101.FaultCode", DataType: plc.TagDint, ElementCount: 1}
	if err := client.Write(tag, int32(42)); err != nil {
		t.Fatalf("write Motor_101.FaultCode: %v", err)
	}
	readback, err := client.Read(tag)
	if err != nil {
		t.Fatalf("readback Motor_101.FaultCode: %v", err)
	}
	if readback != int32(42) {
		t.Fatalf("readback = %v, want 42", readback)
	}

	tags, err := client.DiscoverTags(nil)
	if err != nil {
		t.Fatalf("discover: %v", err)
	}
	var foundContainer, foundField bool
	for _, tag := range tags {
		if tag.Name == "Motor_101" && tag.DataType == plc.TagStruct {
			foundContainer = true
		}
		if tag.Name == "Motor_101.FaultCode" && tag.DataType == plc.TagDint {
			foundField = true
		}
	}
	if !foundContainer {
		t.Fatalf("discovery did not include Motor_101 UDT container")
	}
	if !foundField {
		t.Fatalf("discovery did not include Motor_101.FaultCode")
	}
}

func startTestServer(t *testing.T) string {
	t.Helper()
	profile, err := plcserver.LoadProfile("../profiles/sample-logix.json")
	if err != nil {
		t.Fatalf("load profile: %v", err)
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("reserve listen port: %v", err)
	}
	address := listener.Addr().String()
	if err := listener.Close(); err != nil {
		t.Fatalf("close reserved listener: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	server := &plcserver.Server{PLC: profile, Addr: address}
	errCh := make(chan error, 1)
	go func() {
		errCh <- server.ListenAndServe(ctx)
	}()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("tcp", address, 50*time.Millisecond)
		if err == nil {
			_ = conn.Close()
			return address
		}
		select {
		case err := <-errCh:
			t.Fatalf("server exited before accepting connections: %v", err)
		default:
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("server did not start listening on %s", address)
	return ""
}
