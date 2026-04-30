import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import { ConnectionPanel } from "./components/ConnectionPanel";
import { DiscoverTagsModal } from "./components/DiscoverTagsModal";
import { EventConsole } from "./components/EventConsole";
import { LiveWatchTable } from "./components/LiveWatchTable";
import { TagEntryForm } from "./components/TagEntryForm";
import { TagInspector } from "./components/TagInspector";
import { WatchListModal } from "./components/WatchListModal";
import { api } from "./services/api";
import { subscribeBackendEvents } from "./services/events";
import { parseWatchListFile, WatchListFormat } from "./watchListFiles";
import {
  AppEvent,
  AppState,
  ConnectionConfig,
  DiscoveryProgress,
  TagSnapshot,
  TrendPoint,
  WatchedTag,
  WriteResult,
  WatchListImportResult,
} from "./types";

const initialEvent: AppEvent = {
  id: "pulso-ready",
  level: "INFO",
  type: "backend",
  message: "Pulso ready",
  timestamp: new Date().toISOString(),
};

type ThemeMode = "dark" | "light";

const themeStorageKey = "pulso-theme";
const trendRetentionMs = 5 * 60 * 1000;

function getInitialTheme(): ThemeMode {
  const savedTheme = window.localStorage.getItem(themeStorageKey);
  if (savedTheme === "dark" || savedTheme === "light") {
    return savedTheme;
  }
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

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
  const [trendHistoryByTagId, setTrendHistoryByTagId] = useState<Record<string, TrendPoint[]>>({});
  const [search, setSearch] = useState("");
  const [lastWrites, setLastWrites] = useState<Record<string, WriteResult>>({});
  const [addTagOpen, setAddTagOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<WatchedTag>();
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [discoveryProgress, setDiscoveryProgress] = useState<DiscoveryProgress>();
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [watchListOpen, setWatchListOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);

  useEffect(() => {
    document.body.classList.toggle("theme-light", theme === "light");
    document.body.classList.toggle("theme-dark", theme === "dark");
    window.localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

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
    applyTrendPoint(snapshot);
  }

  function applyTrendPoint(snapshot: TagSnapshot) {
    if (snapshot.status !== "ok") {
      return;
    }
    const value = trendValue(snapshot.currentValue);
    if (value === undefined) {
      return;
    }
    const timestamp = Date.parse(snapshot.lastReadAt) || Date.now();
    const cutoff = timestamp - trendRetentionMs;
    setTrendHistoryByTagId((current) => {
      const existing = current[snapshot.tagId] ?? [];
      const last = existing[existing.length - 1];
      if (last?.timestamp === timestamp && last.value === value) {
        return current;
      }
      const next = [...existing.filter((point) => point.timestamp >= cutoff), { timestamp, value }];
      return { ...current, [snapshot.tagId]: next };
    });
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
    setTrendHistoryByTagId((history) => {
      const next = { ...history };
      delete next[tag.id];
      return next;
    });
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
    setTrendHistoryByTagId((history) => {
      const next = { ...history };
      delete next[tagId];
      return next;
    });
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

  async function importWatchList(file: File): Promise<WatchListImportResult | undefined> {
    const tags = await parseWatchListFile(file);
    if (tags.length === 0) {
      throw new Error("The selected watch-list file does not contain any tags.");
    }
    if (
      state.watchedTags.length > 0 &&
      !window.confirm(`Replace the current watch list with ${tags.length} imported tags?`)
    ) {
      return undefined;
    }
    const result = await api.importWatchedTags(tags);
    const watchedTags = await api.getWatchedTags();
    setState((current) => ({
      ...current,
      watchedTags,
      snapshotsByTagId: {},
      selectedTagId: undefined,
    }));
    setChangedTagIds(new Set());
    setTrendHistoryByTagId({});
    return result;
  }

  async function exportWatchList(format: WatchListFormat): Promise<string | undefined> {
    const path = await api.exportWatchedTags(format);
    return path || undefined;
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
        <div className="header-actions">
          <button className="header-tool" type="button" onClick={() => setWatchListOpen(true)}>
            Watch Lists
          </button>
          <button
            className="theme-toggle"
            type="button"
            aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            aria-pressed={theme === "light"}
            title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
          >
            {theme === "light" ? <MoonIcon /> : <SunIcon />}
          </button>
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
        </div>
      </header>
      <div className={`workspace ${selectedTag ? "has-inspector" : ""}`}>
        <LiveWatchTable
          tags={state.watchedTags}
          snapshotsByTagId={state.snapshotsByTagId}
          selectedTagId={state.selectedTagId}
          changedTagIds={changedTagIds}
          connected={state.connectionStatus.connected}
          search={search}
          pollingActive={state.pollingActive}
          onSearchChange={setSearch}
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
            history={trendHistoryByTagId[selectedTag.id] ?? []}
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
      {watchListOpen ? (
        <WatchListModal
          currentCount={state.watchedTags.length}
          onClose={() => setWatchListOpen(false)}
          onImport={importWatchList}
          onExport={exportWatchList}
        />
      ) : null}
    </main>
  );
}

export default App;

function trendValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  return undefined;
}

function SunIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" focusable="false">
      <path d="M10 2.2h1v2.3h-1V2.2ZM10 15.5h1v2.3h-1v-2.3ZM2.2 10h2.3v1H2.2v-1ZM15.5 10h2.3v1h-2.3v-1ZM4.1 4.8l.7-.7 1.6 1.6-.7.7-1.6-1.6ZM14.6 15.3l.7-.7 1.6 1.6-.7.7-1.6-1.6ZM14.6 5.7l1.6-1.6.7.7-1.6 1.6-.7-.7ZM4.1 16.2l1.6-1.6.7.7-1.6 1.6-.7-.7ZM10.5 6.2a4.3 4.3 0 1 1 0 8.6 4.3 4.3 0 0 1 0-8.6Zm0 1.4a2.9 2.9 0 1 0 0 5.8 2.9 2.9 0 0 0 0-5.8Z" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" focusable="false">
      <path d="M13.7 15.4A6.6 6.6 0 0 1 8.1 4.7a5.2 5.2 0 1 0 7.2 7.2 6.5 6.5 0 0 1-1.6 3.5Zm-3.2 1.4a6.6 6.6 0 0 0 6.3-8.7l-.5-1.4-.9 1.2a3.8 3.8 0 0 1-6.1-4.4l.8-1.2-1.4.2a6.6 6.6 0 0 0 1.8 14.3Z" />
    </svg>
  );
}
