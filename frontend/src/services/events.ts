import { EventsOn } from "../../wailsjs/runtime/runtime";
import {
  AppEvent,
  ConnectionStatus,
  DiscoveryProgress,
  TagSnapshot,
  WriteResult,
} from "../types";

export type BackendEventHandlers = {
  onConnectionStatus: (status: ConnectionStatus) => void;
  onTagSnapshot: (snapshot: TagSnapshot) => void;
  onTagChanged: (snapshot: TagSnapshot) => void;
  onTagError: (snapshot: TagSnapshot) => void;
  onWriteResult: (result: WriteResult) => void;
  onAppEvent: (event: AppEvent) => void;
  onPollingStatus: (active: boolean) => void;
  onDiscoveryProgress: (progress: DiscoveryProgress) => void;
};

export function subscribeBackendEvents(handlers: BackendEventHandlers) {
  const unsubscribers = [
    EventsOn("connection:status", handlers.onConnectionStatus),
    EventsOn("tag:snapshot", handlers.onTagSnapshot),
    EventsOn("tag:changed", handlers.onTagChanged),
    EventsOn("tag:error", handlers.onTagError),
    EventsOn("write:result", handlers.onWriteResult),
    EventsOn("app:event", handlers.onAppEvent),
    EventsOn("polling:status", handlers.onPollingStatus),
    EventsOn("discovery:progress", handlers.onDiscoveryProgress),
  ];

  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  };
}
