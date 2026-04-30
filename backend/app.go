package backend

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"reflect"
	"strings"
	"time"

	"Pulso/backend/events"
	"Pulso/backend/plc"
	"Pulso/backend/watch"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx     context.Context
	client  plc.PLCClient
	manager *watch.Manager
	status  plc.ConnectionStatus
}

type ConnectionConfig = plc.ConnectionConfig
type ConnectionStatus = plc.ConnectionStatus
type TagDataType = plc.TagDataType
type WatchedTag = plc.WatchedTag
type TagValue = plc.TagValue
type TagSnapshot = plc.TagSnapshot
type WriteRequest = plc.WriteRequest
type WriteResult = plc.WriteResult
type DiscoveredTag = plc.DiscoveredTag
type DiscoveryProgress = plc.DiscoveryProgress
type AppEvent = events.AppEvent

type WatchListImportResult struct {
	Imported int      `json:"imported"`
	Errors   []string `json:"errors,omitempty"`
}

type watchListExport struct {
	Format     string           `json:"format"`
	Version    int              `json:"version"`
	ExportedAt string           `json:"exportedAt"`
	Tags       []plc.WatchedTag `json:"tags"`
}

func NewApp() *App {
	client := plc.NewGoPLCClient()
	return &App{
		client:  client,
		manager: watch.NewManager(client, 200*time.Millisecond),
		status:  plc.ConnectionStatus{State: "Disconnected"},
	}
}

func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
	a.emitAppEvent("INFO", "backend", "Pulso ready", nil)
}

func (a *App) Connect(config plc.ConnectionConfig) error {
	a.status = plc.ConnectionStatus{State: "Connecting", Config: &config}
	a.emit("connection:status", a.status)

	if config.TimeoutMs <= 0 {
		config.TimeoutMs = 5000
	}
	if config.PollIntervalMs <= 0 {
		config.PollIntervalMs = 200
	}
	if err := a.manager.SetInterval(config.PollIntervalMs); err != nil {
		a.status = plc.ConnectionStatus{State: "Error", Config: &config, Error: err.Error()}
		a.emit("connection:status", a.status)
		a.emitAppEvent("ERROR", "connection", err.Error(), nil)
		return err
	}
	if err := a.client.Connect(config); err != nil {
		a.status = plc.ConnectionStatus{State: "Error", Config: &config, Error: err.Error()}
		a.emit("connection:status", a.status)
		a.emitAppEvent("ERROR", "connection", err.Error(), nil)
		return err
	}

	a.status = plc.ConnectionStatus{State: "Connected", Connected: true, Config: &config, PollingActive: a.manager.IsPolling()}
	a.emit("connection:status", a.status)
	a.emitAppEvent("INFO", "connection", fmt.Sprintf("Connected to %s", config.Address), config)
	return a.StartPolling()
}

func (a *App) Disconnect() error {
	a.StopPolling()
	err := a.client.Disconnect()
	a.status = plc.ConnectionStatus{State: "Disconnected"}
	a.emit("connection:status", a.status)
	a.emitAppEvent("INFO", "disconnection", "Disconnected", nil)
	return err
}

func (a *App) GetConnectionStatus() plc.ConnectionStatus {
	a.status.PollingActive = a.manager.IsPolling()
	return a.status
}

func (a *App) AddWatchedTag(tag plc.WatchedTag) error {
	normalized, err := watch.NormalizeTag(tag)
	if err != nil {
		a.emitAppEvent("ERROR", "watch", err.Error(), tag)
		return err
	}

	if err := a.validateWatchedTag(normalized); err != nil {
		addErr := fmt.Errorf("tag %s was not added: %w", normalized.Name, err)
		a.emitAppEvent("ERROR", "watch", addErr.Error(), normalized)
		return addErr
	}

	if err := a.manager.AddTag(normalized); err != nil {
		a.emitAppEvent("ERROR", "watch", err.Error(), tag)
		return err
	}
	a.emitAppEvent("INFO", "watch", fmt.Sprintf("Added tag %s as %s", normalized.Name, normalized.DataType), normalized)
	return nil
}

func (a *App) UpdateWatchedTag(tag plc.WatchedTag) error {
	normalized, err := watch.NormalizeTag(tag)
	if err != nil {
		a.emitAppEvent("ERROR", "watch", err.Error(), tag)
		return err
	}
	if _, ok := a.manager.GetTag(normalized.ID); !ok {
		err := fmt.Errorf("tag %s is not watched", normalized.ID)
		a.emitAppEvent("ERROR", "watch", err.Error(), normalized)
		return err
	}

	if err := a.validateWatchedTag(normalized); err != nil {
		updateErr := fmt.Errorf("tag %s was not updated: %w", normalized.Name, err)
		a.emitAppEvent("ERROR", "watch", updateErr.Error(), normalized)
		return updateErr
	}

	if err := a.manager.UpdateTag(normalized); err != nil {
		a.emitAppEvent("ERROR", "watch", err.Error(), normalized)
		return err
	}
	a.emit("tag:snapshot", plc.TagSnapshot{
		TagID:    normalized.ID,
		Name:     normalized.Name,
		DataType: normalized.DataType,
		Status:   "pending",
	})
	a.emitAppEvent("INFO", "watch", fmt.Sprintf("Updated tag %s as %s", normalized.Name, normalized.DataType), normalized)
	return nil
}

func (a *App) validateWatchedTag(tag plc.WatchedTag) error {
	if !a.client.IsConnected() {
		return fmt.Errorf("connect to a PLC before adding or editing watched tags")
	}
	if _, err := a.client.Read(tag); err != nil {
		return fmt.Errorf("PLC read validation failed: %w", err)
	}
	return nil
}

func (a *App) RemoveWatchedTag(tagID string) error {
	tag, _ := a.manager.GetTag(tagID)
	if err := a.manager.RemoveTag(tagID); err != nil {
		a.emitAppEvent("ERROR", "watch", err.Error(), map[string]string{"tagId": tagID})
		return err
	}
	if tag.Name != "" {
		a.emitAppEvent("INFO", "watch", fmt.Sprintf("Removed tag %s", tag.Name), tag)
	}
	return nil
}

func (a *App) GetWatchedTags() []plc.WatchedTag {
	return a.manager.GetTags()
}

func (a *App) ImportWatchedTags(tags []plc.WatchedTag) (WatchListImportResult, error) {
	normalizedTags := make([]plc.WatchedTag, 0, len(tags))
	seenNames := make(map[string]struct{}, len(tags))
	result := WatchListImportResult{}

	for index, tag := range tags {
		normalized, err := watch.NormalizeTag(tag)
		if err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("row %d: %s", index+1, err.Error()))
			continue
		}
		if err := validateImportedWatchedTag(normalized); err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("%s: %s", normalized.Name, err.Error()))
			continue
		}
		if _, exists := seenNames[normalized.Name]; exists {
			result.Errors = append(result.Errors, fmt.Sprintf("%s: duplicate tag", normalized.Name))
			continue
		}
		seenNames[normalized.Name] = struct{}{}
		normalizedTags = append(normalizedTags, normalized)
	}

	if len(normalizedTags) == 0 && len(tags) > 0 {
		err := fmt.Errorf("no valid tags found in import")
		a.emitAppEvent("ERROR", "watch", err.Error(), result)
		return result, err
	}

	if err := a.manager.ReplaceTags(normalizedTags); err != nil {
		a.emitAppEvent("ERROR", "watch", err.Error(), result)
		return result, err
	}
	result.Imported = len(normalizedTags)
	a.emitAppEvent("INFO", "watch", fmt.Sprintf("Imported %d watched tags", result.Imported), result)
	return result, nil
}

func (a *App) ExportWatchedTags(format string) (string, error) {
	format = strings.ToLower(strings.TrimSpace(format))
	if format != "json" && format != "csv" {
		return "", fmt.Errorf("unsupported watch-list export format %q", format)
	}

	tags := a.manager.GetTags()
	if len(tags) == 0 {
		return "", fmt.Errorf("there are no watched tags to export")
	}

	contents, err := encodeWatchList(tags, format)
	if err != nil {
		a.emitAppEvent("ERROR", "watch", err.Error(), map[string]string{"format": format})
		return "", err
	}

	filename := fmt.Sprintf("pulso-watch-list-%s.%s", time.Now().Format("2006-01-02-150405"), format)
	filterName := "JSON watch list (*.json)"
	pattern := "*.json"
	if format == "csv" {
		filterName = "CSV watch list (*.csv)"
		pattern = "*.csv"
	}

	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Export Watch List",
		DefaultFilename: filename,
		Filters: []runtime.FileFilter{{
			DisplayName: filterName,
			Pattern:     pattern,
		}},
		CanCreateDirectories: true,
	})
	if err != nil {
		a.emitAppEvent("ERROR", "watch", err.Error(), map[string]string{"format": format})
		return "", err
	}
	if path == "" {
		return "", nil
	}
	if !strings.HasSuffix(strings.ToLower(path), "."+format) {
		path += "." + format
	}
	if err := os.WriteFile(path, contents, 0o644); err != nil {
		a.emitAppEvent("ERROR", "watch", err.Error(), map[string]string{"path": path})
		return "", err
	}

	a.emitAppEvent("INFO", "watch", fmt.Sprintf("Exported %d watched tags to %s", len(tags), path), map[string]string{"path": path, "format": format})
	return path, nil
}

func encodeWatchList(tags []plc.WatchedTag, format string) ([]byte, error) {
	switch format {
	case "json":
		payload := watchListExport{
			Format:     "pulso.watchlist",
			Version:    1,
			ExportedAt: time.Now().Format(time.RFC3339Nano),
			Tags:       tags,
		}
		data, err := json.MarshalIndent(payload, "", "  ")
		if err != nil {
			return nil, err
		}
		return append(data, '\n'), nil
	case "csv":
		var buffer bytes.Buffer
		writer := csv.NewWriter(&buffer)
		if err := writer.Write([]string{"name", "dataType", "elementCount", "elementSize", "id"}); err != nil {
			return nil, err
		}
		for _, tag := range tags {
			if err := writer.Write([]string{
				tag.Name,
				string(tag.DataType),
				fmt.Sprintf("%d", tag.ElementCount),
				optionalIntString(tag.ElementSize),
				tag.ID,
			}); err != nil {
				return nil, err
			}
		}
		writer.Flush()
		return buffer.Bytes(), writer.Error()
	default:
		return nil, fmt.Errorf("unsupported watch-list export format %q", format)
	}
}

func optionalIntString(value int) string {
	if value == 0 {
		return ""
	}
	return fmt.Sprintf("%d", value)
}

func validateImportedWatchedTag(tag plc.WatchedTag) error {
	switch tag.DataType {
	case plc.TagBool, plc.TagSint, plc.TagInt, plc.TagDint, plc.TagLint, plc.TagReal, plc.TagString, plc.TagStruct:
	default:
		return fmt.Errorf("unsupported data type %q", tag.DataType)
	}
	if tag.ElementCount <= 0 {
		return fmt.Errorf("element count must be greater than zero")
	}
	if tag.ElementSize < 0 {
		return fmt.Errorf("element size cannot be negative")
	}
	return nil
}

func (a *App) DiscoverTags() ([]plc.DiscoveredTag, error) {
	if !a.client.IsConnected() {
		err := fmt.Errorf("PLC is not connected")
		a.emitAppEvent("ERROR", "discovery", err.Error(), nil)
		return nil, err
	}
	a.emitDiscoveryProgress(plc.DiscoveryProgress{
		Phase:   "start",
		Message: "Starting PLC discovery",
	})
	tags, err := a.client.DiscoverTags(a.emitDiscoveryProgress)
	if err != nil {
		a.emitAppEvent("ERROR", "discovery", err.Error(), nil)
		return nil, err
	}
	a.emitAppEvent("INFO", "discovery", fmt.Sprintf("Discovered %d PLC tags", len(tags)), nil)
	return tags, nil
}

func (a *App) ReadTag(tag plc.WatchedTag) (plc.TagSnapshot, error) {
	result, err := a.manager.ReadTag(tag)
	a.emitSnapshot(result, err)
	return result.Snapshot, err
}

func (a *App) WriteTag(req plc.WriteRequest) (plc.WriteResult, error) {
	start := time.Now()
	tag, ok := a.manager.GetTag(req.TagID)
	if !ok {
		err := fmt.Errorf("tag %s is not watched", req.TagID)
		result := failedWrite(req, start, err)
		a.emitWriteResult(result)
		return result, err
	}
	if !a.client.IsConnected() {
		err := fmt.Errorf("PLC is not connected")
		result := failedWrite(req, start, err)
		a.emitWriteResult(result)
		return result, err
	}

	requested, err := plc.NormalizeValue(tag.DataType, req.RequestedValue)
	if err != nil {
		result := failedWrite(req, start, err)
		a.emitWriteResult(result)
		return result, err
	}

	previous, readErr := a.client.Read(tag)
	if readErr != nil {
		result := failedWrite(req, start, fmt.Errorf("pre-write read failed: %w", readErr))
		a.emitWriteResult(result)
		return result, readErr
	}
	if err := a.client.Write(tag, requested); err != nil {
		result := plc.WriteResult{
			TagID:          tag.ID,
			Name:           tag.Name,
			Success:        false,
			RequestedValue: requested,
			PreviousValue:  previous,
			LatencyMs:      time.Since(start).Milliseconds(),
			Note:           "Write failed",
			Error:          err.Error(),
		}
		a.emitWriteResult(result)
		return result, err
	}
	readback, readbackErr := a.client.Read(tag)
	if readbackErr != nil {
		result := plc.WriteResult{
			TagID:          tag.ID,
			Name:           tag.Name,
			Success:        false,
			RequestedValue: requested,
			PreviousValue:  previous,
			LatencyMs:      time.Since(start).Milliseconds(),
			Note:           "Write completed but readback failed",
			Error:          readbackErr.Error(),
		}
		a.emitWriteResult(result)
		return result, readbackErr
	}

	matched := reflect.DeepEqual(requested, readback)
	result := plc.WriteResult{
		TagID:          tag.ID,
		Name:           tag.Name,
		Success:        matched,
		RequestedValue: requested,
		PreviousValue:  previous,
		ReadbackValue:  readback,
		LatencyMs:      time.Since(start).Milliseconds(),
	}
	if matched {
		result.Note = "Write verified"
	} else {
		result.Note = "Write completed but readback value did not match requested value. PLC logic may have overwritten it."
	}
	a.emitWriteResult(result)

	snap, _ := a.manager.ReadTag(tag)
	a.emitSnapshot(snap, nil)
	if !matched {
		return result, errors.New(result.Note)
	}
	return result, nil
}

func (a *App) StartPolling() error {
	if !a.client.IsConnected() {
		return fmt.Errorf("PLC is not connected")
	}
	if err := a.manager.Start(a.ctx, a.emitSnapshot); err != nil {
		a.emitAppEvent("ERROR", "polling", err.Error(), nil)
		return err
	}
	a.status.PollingActive = true
	a.emit("polling:status", true)
	a.emitAppEvent("INFO", "polling", "Polling started", nil)
	return nil
}

func (a *App) StopPolling() error {
	a.manager.Stop()
	a.status.PollingActive = false
	a.emit("polling:status", false)
	a.emitAppEvent("INFO", "polling", "Polling stopped", nil)
	return nil
}

func (a *App) SetPollInterval(ms int) error {
	if err := a.manager.SetInterval(ms); err != nil {
		a.emitAppEvent("ERROR", "polling", err.Error(), map[string]int{"intervalMs": ms})
		return err
	}
	a.emitAppEvent("INFO", "polling", fmt.Sprintf("Poll interval set to %d ms", ms), nil)
	return nil
}

func (a *App) emitSnapshot(result watch.SnapshotResult, err error) {
	if err != nil {
		a.emit("tag:error", result.Snapshot)
		a.emitAppEvent("ERROR", "read", fmt.Sprintf("Timeout or error reading %s: %s", result.Snapshot.Name, err.Error()), result.Snapshot)
		return
	}
	a.emit("tag:snapshot", result.Snapshot)
	if result.Changed {
		a.emit("tag:changed", result.Snapshot)
		a.emitAppEvent("DEBUG", "read", fmt.Sprintf("%s changed from %v to %v", result.Snapshot.Name, result.Snapshot.PreviousValue, result.Snapshot.CurrentValue), result.Snapshot)
	}
}

func (a *App) emitWriteResult(result plc.WriteResult) {
	a.emit("write:result", result)
	if result.Success {
		a.emitAppEvent("INFO", "write", fmt.Sprintf("Write verified for %s: %v", result.Name, result.ReadbackValue), result)
		return
	}
	if result.Error != "" {
		a.emitAppEvent("ERROR", "write", fmt.Sprintf("Write failed for %s: %s", result.Name, result.Error), result)
		return
	}
	a.emitAppEvent("WARN", "write", fmt.Sprintf("Write completed but readback mismatch for %s", result.Name), result)
}

func (a *App) emitDiscoveryProgress(progress plc.DiscoveryProgress) {
	a.emit("discovery:progress", progress)
}

func (a *App) emitAppEvent(level, eventType, message string, payload any) {
	a.emit("app:event", events.New(level, eventType, message, payload))
}

func (a *App) emit(name string, payload any) {
	if a.ctx == nil {
		return
	}
	runtime.EventsEmit(a.ctx, name, payload)
}

func failedWrite(req plc.WriteRequest, start time.Time, err error) plc.WriteResult {
	return plc.WriteResult{
		TagID:          req.TagID,
		Name:           req.Name,
		Success:        false,
		RequestedValue: req.RequestedValue,
		LatencyMs:      time.Since(start).Milliseconds(),
		Note:           "Write failed",
		Error:          err.Error(),
	}
}
