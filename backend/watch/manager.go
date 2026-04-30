package watch

import (
	"context"
	"fmt"
	"reflect"
	"sort"
	"strings"
	"sync"
	"time"

	"Pulso/backend/plc"
)

type SnapshotResult struct {
	Snapshot plc.TagSnapshot
	Changed  bool
}

type Manager struct {
	mu       sync.RWMutex
	client   plc.PLCClient
	tags     map[string]plc.WatchedTag
	snaps    map[string]plc.TagSnapshot
	interval time.Duration
	cancel   context.CancelFunc
	polling  bool
}

func NewManager(client plc.PLCClient, interval time.Duration) *Manager {
	if interval <= 0 {
		interval = 200 * time.Millisecond
	}
	return &Manager{
		client:   client,
		tags:     make(map[string]plc.WatchedTag),
		snaps:    make(map[string]plc.TagSnapshot),
		interval: interval,
	}
}

func NormalizeTag(tag plc.WatchedTag) (plc.WatchedTag, error) {
	tag.Name = strings.TrimSpace(tag.Name)
	if tag.ID == "" {
		tag.ID = fmt.Sprintf("%d", time.Now().UnixNano())
	}
	if tag.Name == "" {
		return tag, fmt.Errorf("tag name is required")
	}
	if tag.ElementCount <= 0 {
		tag.ElementCount = 1
	}
	return tag, nil
}

func (m *Manager) SetClient(client plc.PLCClient) {
	m.mu.Lock()
	m.client = client
	m.mu.Unlock()
}

func (m *Manager) AddTag(tag plc.WatchedTag) error {
	normalized, err := NormalizeTag(tag)
	if err != nil {
		return err
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	m.tags[normalized.ID] = normalized
	m.snaps[normalized.ID] = plc.TagSnapshot{
		TagID:    normalized.ID,
		Name:     normalized.Name,
		DataType: normalized.DataType,
		Status:   "pending",
	}
	return nil
}

func (m *Manager) ReplaceTags(tags []plc.WatchedTag) error {
	nextTags := make(map[string]plc.WatchedTag, len(tags))
	nextSnaps := make(map[string]plc.TagSnapshot, len(tags))
	for _, tag := range tags {
		normalized, err := NormalizeTag(tag)
		if err != nil {
			return err
		}
		if _, exists := nextTags[normalized.ID]; exists {
			return fmt.Errorf("duplicate tag ID %s", normalized.ID)
		}
		nextTags[normalized.ID] = normalized
		nextSnaps[normalized.ID] = plc.TagSnapshot{
			TagID:    normalized.ID,
			Name:     normalized.Name,
			DataType: normalized.DataType,
			Status:   "pending",
		}
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	m.tags = nextTags
	m.snaps = nextSnaps
	return nil
}

func (m *Manager) UpdateTag(tag plc.WatchedTag) error {
	normalized, err := NormalizeTag(tag)
	if err != nil {
		return err
	}
	if normalized.ID == "" {
		return fmt.Errorf("tag ID is required")
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.tags[normalized.ID]; !ok {
		return fmt.Errorf("tag %s is not watched", normalized.ID)
	}
	m.tags[normalized.ID] = normalized
	m.snaps[normalized.ID] = plc.TagSnapshot{
		TagID:    normalized.ID,
		Name:     normalized.Name,
		DataType: normalized.DataType,
		Status:   "pending",
	}
	return nil
}

func (m *Manager) RemoveTag(tagID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.tags[tagID]; !ok {
		return fmt.Errorf("tag %s is not watched", tagID)
	}
	delete(m.tags, tagID)
	delete(m.snaps, tagID)
	return nil
}

func (m *Manager) GetTags() []plc.WatchedTag {
	m.mu.RLock()
	defer m.mu.RUnlock()
	tags := make([]plc.WatchedTag, 0, len(m.tags))
	for _, tag := range m.tags {
		tags = append(tags, tag)
	}
	sort.Slice(tags, func(i, j int) bool {
		return tags[i].Name < tags[j].Name
	})
	return tags
}

func (m *Manager) GetTag(tagID string) (plc.WatchedTag, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	tag, ok := m.tags[tagID]
	return tag, ok
}

func (m *Manager) ReadTag(tag plc.WatchedTag) (SnapshotResult, error) {
	m.mu.RLock()
	client := m.client
	previous := m.snaps[tag.ID]
	m.mu.RUnlock()
	if client == nil || !client.IsConnected() {
		err := fmt.Errorf("PLC is not connected")
		snap := m.errorSnapshot(tag, previous, err)
		return SnapshotResult{Snapshot: snap}, err
	}

	start := time.Now()
	value, err := client.Read(tag)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		snap := m.errorSnapshot(tag, previous, err)
		snap.ReadLatencyMs = latency
		return SnapshotResult{Snapshot: snap}, err
	}

	now := time.Now().Format(time.RFC3339Nano)
	changed := previous.Status != "" && previous.Status != "pending" && !reflect.DeepEqual(previous.CurrentValue, value)
	lastChangedAt := previous.LastChangedAt
	if changed || lastChangedAt == "" {
		lastChangedAt = now
	}
	snap := plc.TagSnapshot{
		TagID:         tag.ID,
		Name:          tag.Name,
		DataType:      tag.DataType,
		CurrentValue:  value,
		PreviousValue: previous.CurrentValue,
		LastReadAt:    now,
		LastChangedAt: lastChangedAt,
		ReadLatencyMs: latency,
		Status:        "ok",
	}

	m.mu.Lock()
	m.snaps[tag.ID] = snap
	m.mu.Unlock()
	return SnapshotResult{Snapshot: snap, Changed: changed}, nil
}

func (m *Manager) Start(ctx context.Context, onResult func(SnapshotResult, error)) error {
	if ctx == nil {
		ctx = context.Background()
	}
	m.mu.Lock()
	if m.polling {
		m.mu.Unlock()
		return nil
	}
	pollCtx, cancel := context.WithCancel(ctx)
	m.cancel = cancel
	m.polling = true
	interval := m.interval
	m.mu.Unlock()

	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-pollCtx.Done():
				return
			default:
				m.pollOnce(onResult)
			}

			select {
			case <-pollCtx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
	return nil
}

func (m *Manager) Stop() {
	m.mu.Lock()
	cancel := m.cancel
	m.cancel = nil
	m.polling = false
	m.mu.Unlock()
	if cancel != nil {
		cancel()
	}
}

func (m *Manager) SetInterval(ms int) error {
	if ms < 50 {
		return fmt.Errorf("poll interval must be at least 50 ms")
	}
	m.mu.Lock()
	m.interval = time.Duration(ms) * time.Millisecond
	m.mu.Unlock()
	return nil
}

func (m *Manager) IsPolling() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.polling
}

func (m *Manager) pollOnce(onResult func(SnapshotResult, error)) {
	tags := m.GetTags()
	for _, tag := range tags {
		result, err := m.ReadTag(tag)
		onResult(result, err)
	}
}

func (m *Manager) errorSnapshot(tag plc.WatchedTag, previous plc.TagSnapshot, err error) plc.TagSnapshot {
	snap := plc.TagSnapshot{
		TagID:         tag.ID,
		Name:          tag.Name,
		DataType:      tag.DataType,
		CurrentValue:  previous.CurrentValue,
		PreviousValue: previous.PreviousValue,
		LastReadAt:    time.Now().Format(time.RFC3339Nano),
		LastChangedAt: previous.LastChangedAt,
		Status:        "error",
		Error:         err.Error(),
	}
	m.mu.Lock()
	m.snaps[tag.ID] = snap
	m.mu.Unlock()
	return snap
}
