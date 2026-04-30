package events

import (
	"fmt"
	"time"
)

type AppEvent struct {
	ID        string `json:"id"`
	Level     string `json:"level"`
	Type      string `json:"type"`
	Message   string `json:"message"`
	Timestamp string `json:"timestamp"`
	Payload   any    `json:"payload,omitempty"`
}

func New(level, eventType, message string, payload any) AppEvent {
	return AppEvent{
		ID:        fmt.Sprintf("%d", time.Now().UnixNano()),
		Level:     level,
		Type:      eventType,
		Message:   message,
		Timestamp: time.Now().Format(time.RFC3339Nano),
		Payload:   payload,
	}
}
