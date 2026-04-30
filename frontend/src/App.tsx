import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import { ConnectionPanel } from "./components/ConnectionPanel";
import { DiscoverTagsModal } from "./components/DiscoverTagsModal";
import { EventConsole } from "./components/EventConsole";
import { LiveWatchTable } from "./components/LiveWatchTable";
import { TagEntryForm } from "./components/TagEntryForm";
import { TagInspector } from "./components/TagInspector";
import { api } from "./services/api";
import { subscribeBackendEvents } from "./services/events";
import {
  AppEvent,
  AppState,
  ConnectionConfig,
  DiscoveryProgress,
  TagSnapshot,
  WatchedTag,
  WriteResult,
} from "./types";

const initialEvent: AppEvent = {
  id: "pulso-ready",
  level: "INFO",
  type: "backend",
  message: "Pulso ready",
  timestamp: new Date().toISOString(),
};

function App() {
  const [state, setState] = useState<AppState>({
    connectionStatus: {
      state: "Disconnected",
      connected: false,
      pollingActive: false,
    },
    watchedTags: [],
    snapshotsByTagId: {},
    events: [initialEvent],
    pollingActive: false,
  });
  const [changedTagIds, setChangedTagIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [changedOnly, setChangedOnly] = useState(false);
  const [lastWrites, setLastWrites] = useState<Record<string, WriteResult>>({});
  const [addTagOpen, setAddTagOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<WatchedTag>();
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [discoveryProgress, setDiscoveryProgress] = useState<DiscoveryProgress>();
  const [connectionOpen, setConnectionOpen] = useState(false);

  useEffect(() => {
    api.getConnectionStatus().then((connectionStatus) => {
      setState((current) => ({
        ...current,
        connectionStatus,
        pollingActive: connectionStatus.pollingActive,
      }));
    });
    api.getWatchedTags().then((watchedTags) => {
      setState((current) => ({ ...current, watchedTags }));
    });

    return subscribeBackendEvents({
      onConnectionStatus: (connectionStatus) =>
        setState((current) => ({
          ...current,
          connectionStatus,
          pollingActive: connectionStatus.pollingActive,
        })),
      onTagSnapshot: (snapshot) => applySnapshot(snapshot),
      onTagChanged: (snapshot) => {
        applySnapshot(snapshot);
        setChangedTagIds((current) => new Set(current).add(snapshot.tagId));
        window.setTimeout(() => {
          setChangedTagIds((current) => {
            const next = new Set(current);
            next.delete(snapshot.tagId);
            return next;
          });
        }, 1800);
      },
      onTagError: (snapshot) => applySnapshot(snapshot),
      onWriteResult: (result) =>
        setLastWrites((current) => ({ ...current, [result.tagId]: result })),
      onAppEvent: (event) =>
        setState((current) => ({
          ...current,
          events:
            event.message === "Pulso ready" &&
            current.events.some((item) => item.id === "pulso-ready")
              ? current.events
              : [...current.events, event].slice(-500),
        })),
      onPollingStatus: (pollingActive) =>
        setState((current) => ({ ...current, pollingActive })),
      onDiscoveryProgress: setDiscoveryProgress,
    });
  }, []);

  function applySnapshot(snapshot: TagSnapshot) {
    setState((current) => ({
      ...current,
      snapshotsByTagId: {
        ...current.snapshotsByTagId,
        [snapshot.tagId]: snapshot,
      },
    }));
  }

  async function connect(config: ConnectionConfig) {
    await api.connect(config);
  }

  async function disconnect() {
    await api.disconnect();
  }

  async function addTag(tag: WatchedTag) {
    await api.addWatchedTag(tag);
    const watchedTags = await api.getWatchedTags();
    setState((current) => ({
      ...current,
      watchedTags,
      selectedTagId: current.selectedTagId ?? tag.id,
    }));
  }

  async function updateTag(tag: WatchedTag) {
    await api.updateWatchedTag(tag);
    const watchedTags = await api.getWatchedTags();
    setState((current) => {
      const snapshotsByTagId = { ...current.snapshotsByTagId };
      delete snapshotsByTagId[tag.id];
      return {
        ...current,
        watchedTags,
        snapshotsByTagId,
        selectedTagId: tag.id,
      };
    });
  }

  async function removeTag(tagId: string) {
    await api.removeWatchedTag(tagId);
    setState((current) => {
      const snapshotsByTagId = { ...current.snapshotsByTagId };
      delete snapshotsByTagId[tagId];
      return {
        ...current,
        watchedTags: current.watchedTags.filter((tag) => tag.id !== tagId),
        snapshotsByTagId,
        selectedTagId:
          current.selectedTagId === tagId ? undefined : current.selectedTagId,
      };
    });
  }

  async function togglePolling() {
    if (state.pollingActive) {
      await api.stopPolling();
    } else {
      await api.startPolling();
    }
  }

  async function writeSelected(value: string) {
    const tag = selectedTag;
    if (!tag) {
      return;
    }
    try {
      await api.writeTag({
        tagId: tag.id,
        name: tag.name,
        dataType: tag.dataType,
        requestedValue: value,
      });
    } catch {
      // Failed and mismatched writes are returned as rejected promises by Wails.
      // The write:result event carries the structured result for the UI.
    }
  }

  const discoverTags = useCallback(async () => {
    setDiscoveryProgress(undefined);
    return api.discoverTags();
  }, []);

  const selectedTag = useMemo(
    () => state.watchedTags.find((tag) => tag.id === state.selectedTagId),
    [state.selectedTagId, state.watchedTags]
  );
  const selectedSnapshot = selectedTag
    ? state.snapshotsByTagId[selectedTag.id]
    : undefined;

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <div className="eyebrow">PLC state debugger</div>
          <div className="brand-row">
            <svg
              className="brand-mark"
              viewBox="0 0 32 32"
              role="img"
              aria-label="Pulso heart pulse logo"
            >
              <path
                d="M16 27s-9.5-5.8-12.2-12.1C1.8 10.1 4.8 5.5 9.3 5.5c2.6 0 4.4 1.4 5.4 3.1C15.1 9.3 15.5 10 16 10s.9-.7 1.3-1.4c1-1.7 2.8-3.1 5.4-3.1 4.5 0 7.5 4.6 5.5 9.4C25.5 21.2 16 27 16 27Z"
                className="brand-heart"
              />
              <path
                d="M5 16h5l2-4 3.2 8 2.8-6h3.2l1.6-3 2.2 5h2"
                className="brand-pulse"
              />
            </svg>
            <h1>Pulso</h1>
          </div>
        </div>
        <div className="header-metrics" aria-label="Current session status">
          <div>
            <span>Tags</span>
            <strong>{state.watchedTags.length}</strong>
          </div>
          <div>
            <span>Events</span>
            <strong>{state.events.length}</strong>
          </div>
          <div>
            <span>Link</span>
            <strong>{state.connectionStatus.state}</strong>
          </div>
        </div>
        <button
          className={`connection-chip ${
            state.connectionStatus.connected ? "is-connected" : "is-disconnected"
          }`}
          type="button"
          onClick={() => setConnectionOpen(true)}
        >
          <span />
          <strong>{state.connectionStatus.connected ? "Connected" : "Connect"}</strong>
          <em>{state.pollingActive ? "Live" : "Idle"}</em>
        </button>
      </header>
      <div className={`workspace ${selectedTag ? "has-inspector" : ""}`}>
        <LiveWatchTable
          tags={state.watchedTags}
          snapshotsByTagId={state.snapshotsByTagId}
          selectedTagId={state.selectedTagId}
          changedTagIds={changedTagIds}
          connected={state.connectionStatus.connected}
          search={search}
          changedOnly={changedOnly}
          pollingActive={state.pollingActive}
          onSearchChange={setSearch}
          onChangedOnlyChange={setChangedOnly}
          onTogglePolling={togglePolling}
          onClearHighlights={() => setChangedTagIds(new Set())}
          onConnect={() => setConnectionOpen(true)}
          onAddTag={() => setAddTagOpen(true)}
          onDiscoverTags={() => setDiscoverOpen(true)}
          onSelect={(selectedTagId) =>
            setState((current) => ({ ...current, selectedTagId }))
          }
          onEdit={setEditingTag}
          onRemove={removeTag}
        />
        {selectedTag ? (
          <TagInspector
            tag={selectedTag}
            snapshot={selectedSnapshot}
            lastWrite={lastWrites[selectedTag.id]}
            onWrite={writeSelected}
            onClose={() =>
              setState((current) => ({ ...current, selectedTagId: undefined }))
            }
          />
        ) : null}
      </div>
      <EventConsole
        events={state.events}
        onClear={() => setState((current) => ({ ...current, events: [] }))}
      />
      {addTagOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setAddTagOpen(false)}>
          <section
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-tag-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div className="section-title compact" id="add-tag-title">
                Add Tag
              </div>
              <button className="secondary" type="button" onClick={() => setAddTagOpen(false)}>
                Close
              </button>
            </div>
            <TagEntryForm onAdd={addTag} onAdded={() => setAddTagOpen(false)} />
          </section>
        </div>
      ) : null}
      {editingTag ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setEditingTag(undefined)}>
          <section
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-tag-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div className="section-title compact" id="edit-tag-title">
                Edit Tag
              </div>
              <button className="secondary" type="button" onClick={() => setEditingTag(undefined)}>
                Close
              </button>
            </div>
            <TagEntryForm
              initialTag={editingTag}
              onAdd={updateTag}
              onAdded={() => setEditingTag(undefined)}
              submitLabel="Update Watch"
            />
          </section>
        </div>
      ) : null}
      {connectionOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setConnectionOpen(false)}>
          <section
            className="modal-panel connection-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="connection-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div className="section-title compact" id="connection-title">
                Connection
              </div>
              <button className="secondary" type="button" onClick={() => setConnectionOpen(false)}>
                Close
              </button>
            </div>
            <ConnectionPanel
              status={state.connectionStatus}
              onConnect={async (config) => {
                await connect(config);
                setConnectionOpen(false);
              }}
              onDisconnect={disconnect}
              embedded
            />
          </section>
        </div>
      ) : null}
      {discoverOpen ? (
        <DiscoverTagsModal
          onClose={() => setDiscoverOpen(false)}
          onDiscover={discoverTags}
          progress={discoveryProgress}
          onAdd={addTag}
        />
      ) : null}
    </main>
  );
}

export default App;
