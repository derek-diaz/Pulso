//go:build !libplctag

package plc

import (
	"fmt"
	"sync"
)

type GoPLCClient struct {
	mu        sync.Mutex
	connected bool
}

func NewGoPLCClient() *GoPLCClient {
	return &GoPLCClient{}
}

func (c *GoPLCClient) Connect(config ConnectionConfig) error {
	return fmt.Errorf("libplctag support is not enabled in this build; install libplctag and build with -tags libplctag")
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
	return nil, fmt.Errorf("libplctag support is not enabled in this build")
}

func (c *GoPLCClient) Write(tag WatchedTag, value any) error {
	return fmt.Errorf("libplctag support is not enabled in this build")
}

func (c *GoPLCClient) DiscoverTags(progress func(DiscoveryProgress)) ([]DiscoveredTag, error) {
	return nil, fmt.Errorf("libplctag support is not enabled in this build")
}
