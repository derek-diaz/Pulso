export type TagDataType =
  | "BOOL"
  | "SINT"
  | "INT"
  | "DINT"
  | "LINT"
  | "REAL"
  | "STRING"
  | "STRUCT";

export type ConnectionState =
  | "Disconnected"
  | "Connecting"
  | "Connected"
  | "Error";

export type ConnectionConfig = {
  address: string;
  path: string;
  timeoutMs: number;
  pollIntervalMs: number;
};

export type ConnectionStatus = {
  state: ConnectionState;
  connected: boolean;
  pollingActive: boolean;
  config?: ConnectionConfig;
  error?: string;
};

export type WatchedTag = {
  id: string;
  name: string;
  dataType: TagDataType;
  elementCount: number;
  elementSize?: number;
};

export type DiscoveredTag = {
  name: string;
  scope: string;
  dataType?: TagDataType;
  rawType: number;
  typeId?: number;
  elementSize: number;
  elementCount: number;
  dimensions?: number[];
  watchable: boolean;
  unsupportedReason?: string;
};

export type DiscoveryProgress = {
  phase: string;
  message: string;
  current: number;
  total: number;
};

export type TagSnapshot = {
  tagId: string;
  name: string;
  dataType: TagDataType;
  currentValue: unknown;
  previousValue: unknown;
  lastReadAt: string;
  lastChangedAt: string;
  readLatencyMs: number;
  status: "pending" | "ok" | "error";
  error?: string;
};

export type WriteRequest = {
  tagId: string;
  name: string;
  dataType: TagDataType;
  requestedValue: unknown;
};

export type WriteResult = {
  tagId: string;
  name: string;
  success: boolean;
  requestedValue: unknown;
  previousValue: unknown;
  readbackValue: unknown;
  latencyMs: number;
  note: string;
  error?: string;
};

export type AppEvent = {
  id: string;
  level: "INFO" | "WARN" | "ERROR" | "DEBUG";
  type: string;
  message: string;
  timestamp: string;
  payload?: unknown;
};

export type AppState = {
  connectionStatus: ConnectionStatus;
  watchedTags: WatchedTag[];
  snapshotsByTagId: Record<string, TagSnapshot>;
  selectedTagId?: string;
  events: AppEvent[];
  pollingActive: boolean;
};
