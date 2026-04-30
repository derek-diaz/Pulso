package plc

type ConnectionConfig struct {
	Address        string `json:"address"`
	Path           string `json:"path"`
	TimeoutMs      int    `json:"timeoutMs"`
	PollIntervalMs int    `json:"pollIntervalMs"`
}

type ConnectionStatus struct {
	State         string            `json:"state"`
	Connected     bool              `json:"connected"`
	PollingActive bool              `json:"pollingActive"`
	Config        *ConnectionConfig `json:"config,omitempty"`
	Error         string            `json:"error,omitempty"`
}

type TagDataType string

const (
	TagBool   TagDataType = "BOOL"
	TagSint   TagDataType = "SINT"
	TagInt    TagDataType = "INT"
	TagDint   TagDataType = "DINT"
	TagLint   TagDataType = "LINT"
	TagReal   TagDataType = "REAL"
	TagString TagDataType = "STRING"
	TagStruct TagDataType = "STRUCT"
)

type WatchedTag struct {
	ID           string      `json:"id"`
	Name         string      `json:"name"`
	DataType     TagDataType `json:"dataType"`
	ElementCount int         `json:"elementCount"`
	ElementSize  int         `json:"elementSize,omitempty"`
}

type DiscoveredTag struct {
	Name              string      `json:"name"`
	Scope             string      `json:"scope"`
	DataType          TagDataType `json:"dataType,omitempty"`
	RawType           uint16      `json:"rawType"`
	TypeID            uint16      `json:"typeId,omitempty"`
	ElementSize       uint16      `json:"elementSize"`
	ElementCount      int         `json:"elementCount"`
	Dimensions        []int       `json:"dimensions,omitempty"`
	Watchable         bool        `json:"watchable"`
	UnsupportedReason string      `json:"unsupportedReason,omitempty"`
}

type DiscoveryProgress struct {
	Phase   string `json:"phase"`
	Message string `json:"message"`
	Current int    `json:"current"`
	Total   int    `json:"total"`
}

type TagValue struct {
	Type  TagDataType `json:"type"`
	Value any         `json:"value"`
}

type TagSnapshot struct {
	TagID         string      `json:"tagId"`
	Name          string      `json:"name"`
	DataType      TagDataType `json:"dataType"`
	CurrentValue  any         `json:"currentValue"`
	PreviousValue any         `json:"previousValue"`
	LastReadAt    string      `json:"lastReadAt"`
	LastChangedAt string      `json:"lastChangedAt"`
	ReadLatencyMs int64       `json:"readLatencyMs"`
	Status        string      `json:"status"`
	Error         string      `json:"error,omitempty"`
}

type WriteRequest struct {
	TagID          string      `json:"tagId"`
	Name           string      `json:"name"`
	DataType       TagDataType `json:"dataType"`
	RequestedValue any         `json:"requestedValue"`
}

type WriteResult struct {
	TagID          string `json:"tagId"`
	Name           string `json:"name"`
	Success        bool   `json:"success"`
	RequestedValue any    `json:"requestedValue"`
	PreviousValue  any    `json:"previousValue"`
	ReadbackValue  any    `json:"readbackValue"`
	LatencyMs      int64  `json:"latencyMs"`
	Note           string `json:"note"`
	Error          string `json:"error,omitempty"`
}

type PLCClient interface {
	Connect(config ConnectionConfig) error
	Disconnect() error
	IsConnected() bool
	Read(tag WatchedTag) (any, error)
	Write(tag WatchedTag, value any) error
	DiscoverTags(progress func(DiscoveryProgress)) ([]DiscoveredTag, error)
}
