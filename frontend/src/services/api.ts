import {
  ConnectionConfig,
  ConnectionStatus,
  WatchedTag,
  TagSnapshot,
  WriteRequest,
  WriteResult,
  DiscoveredTag,
} from "../types";
import {
  AddWatchedTag,
  Connect,
  DiscoverTags,
  Disconnect,
  GetConnectionStatus,
  GetWatchedTags,
  ReadTag,
  RemoveWatchedTag,
  SetPollInterval,
  StartPolling,
  StopPolling,
  UpdateWatchedTag,
  WriteTag,
} from "../../wailsjs/go/backend/App";

export const api = {
  connect: (config: ConnectionConfig): Promise<void> => Connect(config),
  disconnect: (): Promise<void> => Disconnect(),
  getConnectionStatus: (): Promise<ConnectionStatus> =>
    GetConnectionStatus() as unknown as Promise<ConnectionStatus>,
  addWatchedTag: (tag: WatchedTag): Promise<void> => AddWatchedTag(tag),
  updateWatchedTag: (tag: WatchedTag): Promise<void> => UpdateWatchedTag(tag),
  discoverTags: (): Promise<DiscoveredTag[]> =>
    DiscoverTags() as unknown as Promise<DiscoveredTag[]>,
  removeWatchedTag: (tagId: string): Promise<void> => RemoveWatchedTag(tagId),
  getWatchedTags: (): Promise<WatchedTag[]> =>
    GetWatchedTags() as unknown as Promise<WatchedTag[]>,
  readTag: (tag: WatchedTag): Promise<TagSnapshot> =>
    ReadTag(tag) as unknown as Promise<TagSnapshot>,
  writeTag: (request: WriteRequest): Promise<WriteResult> =>
    WriteTag(request) as unknown as Promise<WriteResult>,
  startPolling: (): Promise<void> => StartPolling(),
  stopPolling: (): Promise<void> => StopPolling(),
  setPollInterval: (ms: number): Promise<void> => SetPollInterval(ms),
};
