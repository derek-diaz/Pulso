import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  activityLevel,
  appendTagHistory,
  formatDelta,
  InvestigationScope,
  runtimeStatus,
  samplesForWindow,
  TagHistory,
  TrendWindow,
} from "./tagHistory";
import { parseWatchListFile, WatchListFormat } from "./watchListFiles";
import {
  AppEvent,
  AppState,
  ConnectionConfig,
  DiscoveryProgress,
  TagSnapshot,
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
const historySampleLimit = 60;

type InvestigationEvent = {
  id: string;
  tagId?: string;
  tone: "neutral" | "ok" | "warn" | "error";
  message: string;
  timestamp: string;
};

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
  const [tagHistory, setTagHistory] = useState<TagHistory>({});
  const [nowMs, setNowMs] = useState(Date.now());
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<InvestigationScope>("all");
  const [pinnedTagIds, setPinnedTagIds] = useState<Set<string>>(new Set());
  const [investigationEvents, setInvestigationEvents] = useState<InvestigationEvent[]>([]);
  const [lastWrites, setLastWrites] = useState<Record<string, WriteResult>>({});
  const [addTagOpen, setAddTagOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<WatchedTag>();
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [discoveryProgress, setDiscoveryProgress] = useState<DiscoveryProgress>();
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [watchListOpen, setWatchListOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [consoleCollapsed, setConsoleCollapsed] = useState(false);
  const changeTimersRef = useRef<Record<string, number>>({});
  const pendingSnapshotsRef = useRef<Record<string, TagSnapshot>>({});
  const snapshotFrameRef = useRef<number>();

  useEffect(() => {
    document.body.classList.toggle("theme-light", theme === "light");
    document.body.classList.toggle("theme-dark", theme === "dark");
    window.localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

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

    const unsubscribe = subscribeBackendEvents({
      onConnectionStatus: (connectionStatus) => {
        setState((current) => ({
          ...current,
          connectionStatus,
          pollingActive: connectionStatus.pollingActive,
        }));
        pushInvestigationEvent({
          tone: connectionStatus.connected ? "ok" : connectionStatus.state === "Error" ? "error" : "neutral",
          message: connectionStatus.connected
            ? `Connected to ${connectionStatus.config?.address ?? "controller"}`
            : connectionStatus.state === "Error"
            ? `Connection error`
            : "Disconnected",
          timestamp: new Date().toISOString(),
        });
      },
      onTagSnapshot: (snapshot) => applySnapshot(snapshot),
      onTagChanged: (snapshot) => {
        markTagChanged(snapshot.tagId);
        pushInvestigationEvent({
          tagId: snapshot.tagId,
          tone: "ok",
          message: `${snapshot.name} changed ${formatDelta(snapshot.currentValue, snapshot.previousValue).label}`,
          timestamp: snapshot.lastChangedAt || new Date().toISOString(),
        });
      },
      onTagError: (snapshot) => {
        applySnapshot(snapshot);
        pushInvestigationEvent({
          tagId: snapshot.tagId,
          tone: "error",
          message: `${snapshot.name} read error`,
          timestamp: snapshot.lastReadAt || new Date().toISOString(),
        });
      },
      onWriteResult: (result) => {
        setLastWrites((current) => ({ ...current, [result.tagId]: result }));
        const mismatch = String(result.requestedValue) !== String(result.readbackValue);
        pushInvestigationEvent({
          tagId: result.tagId,
          tone: result.success && !mismatch ? "ok" : mismatch ? "warn" : "error",
          message: mismatch
            ? `${result.name} write mismatch`
            : result.success
            ? `${result.name} write verified`
            : `${result.name} write failed`,
          timestamp: new Date().toISOString(),
        });
      },
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

    return () => {
      unsubscribe();
      Object.values(changeTimersRef.current).forEach((timer) => window.clearTimeout(timer));
      changeTimersRef.current = {};
      if (snapshotFrameRef.current !== undefined) {
        window.cancelAnimationFrame(snapshotFrameRef.current);
        snapshotFrameRef.current = undefined;
      }
    };
  }, []);

  function applySnapshot(snapshot: TagSnapshot) {
    pendingSnapshotsRef.current[snapshot.tagId] = snapshot;
    setTagHistory((current) => appendTagHistory(current, snapshot, historySampleLimit));
    if (snapshotFrameRef.current === undefined) {
      snapshotFrameRef.current = window.requestAnimationFrame(() => {
        snapshotFrameRef.current = undefined;
        const pendingSnapshots = pendingSnapshotsRef.current;
        pendingSnapshotsRef.current = {};
        setState((current) => ({
          ...current,
          snapshotsByTagId: {
            ...current.snapshotsByTagId,
            ...pendingSnapshots,
          },
        }));
      });
    }
  }

  function markTagChanged(tagId: string) {
    setChangedTagIds((current) => new Set(current).add(tagId));
    const existingTimer = changeTimersRef.current[tagId];
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer);
    }
    changeTimersRef.current[tagId] = window.setTimeout(() => {
      delete changeTimersRef.current[tagId];
      setChangedTagIds((current) => {
        const next = new Set(current);
        next.delete(tagId);
        return next;
      });
    }, 1800);
  }

  function pushInvestigationEvent(event: Omit<InvestigationEvent, "id">) {
    setInvestigationEvents((current) =>
      [
        {
          ...event,
          id: `${event.timestamp}-${event.message}-${Math.random().toString(16).slice(2)}`,
        },
        ...current,
      ].slice(0, 8)
    );
  }

  function togglePinned(tagId: string) {
    setPinnedTagIds((current) => {
      const next = new Set(current);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
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
    setTagHistory((current) => {
      const next = { ...current };
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
    setTagHistory((current) => {
      const next = { ...current };
      delete next[tagId];
      return next;
    });
    setPinnedTagIds((current) => {
      const next = new Set(current);
      next.delete(tagId);
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
    setTagHistory({});
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
  const connectionConfig = state.connectionStatus.config;
  const staleAfterMs = Math.max(5000, (connectionConfig?.pollIntervalMs ?? 1000) * 3);
  const tableTrendWindow: TrendWindow = "30s";
  const scopedRows = state.watchedTags.map((tag) => {
    const snapshot = state.snapshotsByTagId[tag.id];
    const status = runtimeStatus(snapshot, lastWrites[tag.id], nowMs, staleAfterMs);
    const samples = samplesForWindow(tagHistory[tag.id] ?? [], tableTrendWindow, nowMs);
    const activity = activityLevel(samples, snapshot, status);
    return { tag, snapshot, status, activity };
  });
  const searchNeedle = search.trim().toLowerCase();
  const visibleRows = scopedRows
    .filter((row) => scopeMatches(row, scope, pinnedTagIds))
    .filter((row) => !searchNeedle || row.tag.name.toLowerCase().includes(searchNeedle));
  const focusSummary = visibleRows.reduce(
    (summary, tag) => {
      return {
        changing: summary.changing + (tag.activity.changes > 0 ? 1 : 0),
        stale: summary.stale + (tag.status.label === "STALE" ? 1 : 0),
        errors: summary.errors + (tag.status.label === "ERROR" ? 1 : 0),
        written:
          summary.written +
          (tag.status.label === "WRITTEN" || tag.status.label === "OVERRIDDEN" ? 1 : 0),
      };
    },
    { changing: 0, stale: 0, errors: 0, written: 0 }
  );
  const pinnedTags = state.watchedTags.filter((tag) => pinnedTagIds.has(tag.id));

  function selectTag(selectedTagId: string) {
    setState((current) => ({ ...current, selectedTagId }));
  }

  function scopeMatches(
    row: { tag: WatchedTag; status: ReturnType<typeof runtimeStatus>; activity: ReturnType<typeof activityLevel> },
    currentScope: InvestigationScope,
    pins: Set<string>
  ) {
    switch (currentScope) {
      case "changing":
        return row.activity.changes > 0 || changedTagIds.has(row.tag.id);
      case "errors":
        return row.status.label === "ERROR";
      case "stale":
        return row.status.label === "STALE";
      case "written":
        return row.status.label === "WRITTEN" || row.status.label === "OVERRIDDEN";
      case "pinned":
        return pins.has(row.tag.id);
      default:
        return true;
    }
  }

  return (
    <main className={`app-shell ${consoleCollapsed ? "console-collapsed" : ""}`}>
      <header className="app-header">
        <div className="brand-block">
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
          <button
            className={`connection-chip ${
              state.connectionStatus.connected ? "is-connected" : "is-disconnected"
            }`}
            type="button"
            onClick={() => setConnectionOpen(true)}
          >
            <span />
            <strong>{state.connectionStatus.connected ? "Connected" : "Connect"}</strong>
          </button>
          <div className="connection-details" aria-label="PLC connection details">
            <span>{connectionConfig?.address ?? "No PLC target"}</span>
            <span>{connectionConfig ? `${connectionConfig.pollIntervalMs} ms poll` : "polling idle"}</span>
          </div>
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
          <button className="header-tool" type="button" onClick={() => setWatchListOpen(true)}>
            Saved Sessions
          </button>
        </div>
      </header>
      <div className="app-body">
        <aside className="left-sidebar" aria-label="Investigation navigator">
          <section className="sidebar-section">
            <div className="sidebar-heading">Connection</div>
            <button
              className={`sidebar-connection ${state.connectionStatus.connected ? "is-connected" : "is-disconnected"}`}
              type="button"
              onClick={() => setConnectionOpen(true)}
            >
              <span />
              <strong>{state.connectionStatus.connected ? "Connected" : "Disconnected"}</strong>
              <em>{connectionConfig?.address ?? "No PLC target"}</em>
              <em>{connectionConfig ? `Poll: ${connectionConfig.pollIntervalMs} ms` : "Poll: idle"}</em>
            </button>
          </section>
          <section className="sidebar-section">
            <div className="sidebar-heading">Focus</div>
            <dl className="sidebar-metrics compact">
              <dt>Visible</dt>
              <dd>{visibleRows.length}</dd>
              <dt>Changing</dt>
              <dd>{focusSummary.changing}</dd>
              <dt>Stale</dt>
              <dd className={focusSummary.stale ? "metric-warn" : ""}>{focusSummary.stale}</dd>
              <dt>Errors</dt>
              <dd className={focusSummary.errors ? "metric-error" : ""}>{focusSummary.errors}</dd>
              <dt>Written</dt>
              <dd>{focusSummary.written}</dd>
            </dl>
          </section>
          <section className="sidebar-section">
            <div className="sidebar-heading">Scopes</div>
            <div className="scope-list">
              {([
                ["all", "All", state.watchedTags.length],
                ["changing", "Changing", scopedRows.filter((row) => row.activity.changes > 0).length],
                ["errors", "Errors", scopedRows.filter((row) => row.status.label === "ERROR").length],
                ["stale", "Stale", scopedRows.filter((row) => row.status.label === "STALE").length],
                [
                  "written",
                  "Written",
                  scopedRows.filter(
                    (row) => row.status.label === "WRITTEN" || row.status.label === "OVERRIDDEN"
                  ).length,
                ],
                ["pinned", "Pinned", pinnedTagIds.size],
              ] as Array<[InvestigationScope, string, number]>).map(([key, label, count]) => (
                <button
                  key={key}
                  className={`scope-row ${scope === key ? "is-selected" : ""}`}
                  type="button"
                  onClick={() => setScope(key)}
                >
                  <span>{label}</span>
                  <em>{count}</em>
                </button>
              ))}
            </div>
          </section>
          <section className="sidebar-section pinned-section">
            <div className="sidebar-heading">Pinned</div>
            <div className="pinned-list">
              {pinnedTags.length === 0 ? (
                <div className="sidebar-empty">Pin tags from the table.</div>
              ) : (
                pinnedTags.map((tag) => {
                  const snapshot = state.snapshotsByTagId[tag.id];
                  const status = runtimeStatus(snapshot, lastWrites[tag.id], nowMs, staleAfterMs);
                  const delta = formatDelta(snapshot?.currentValue, snapshot?.previousValue);
                  return (
                    <button
                      key={tag.id}
                      className={`pinned-row ${state.selectedTagId === tag.id ? "is-selected" : ""}`}
                      type="button"
                      onClick={() => selectTag(tag.id)}
                      title={tag.name}
                    >
                      <span className={`row-status-dot status-${status.tone}`} />
                      <code>{tag.name}</code>
                      <em className={`delta-${delta.tone}`}>{delta.label}</em>
                    </button>
                  );
                })
              )}
            </div>
          </section>
          <section className="sidebar-section recent-events-section">
            <div className="sidebar-heading">Recent Events</div>
            <div className="recent-event-list">
              {investigationEvents.length === 0 ? (
                <div className="sidebar-empty">No meaningful events yet.</div>
              ) : (
                investigationEvents.map((event) => (
                  <button
                    key={event.id}
                    className={`recent-event-row event-${event.tone}`}
                    type="button"
                    disabled={!event.tagId}
                    onClick={() => event.tagId && selectTag(event.tagId)}
                    title={event.message}
                  >
                    <span />
                    <strong>{event.message}</strong>
                    <em>{new Date(event.timestamp).toLocaleTimeString([], { hour12: false, minute: "2-digit", second: "2-digit" })}</em>
                  </button>
                ))
              )}
            </div>
          </section>
          <section className="sidebar-section">
            <div className="sidebar-heading">Actions</div>
            <div className="sidebar-actions compact-actions">
              <button className="tool-link primary-action" type="button" disabled={!state.connectionStatus.connected} onClick={() => setAddTagOpen(true)}>
                + Add Tag
              </button>
              <button className="tool-link" type="button" disabled={!state.connectionStatus.connected} onClick={() => setDiscoverOpen(true)}>
                Discover Tags
              </button>
              <button className="tool-link" type="button" onClick={() => setWatchListOpen(true)}>
                Save Session
              </button>
              <button className="tool-link" type="button" onClick={() => setChangedTagIds(new Set())}>
                Clear Highlights
              </button>
            </div>
          </section>
        </aside>
        <div className={`workspace ${selectedTag ? "has-inspector" : ""}`}>
          <LiveWatchTable
            tags={state.watchedTags}
            snapshotsByTagId={state.snapshotsByTagId}
            historiesByTagId={tagHistory}
            lastWritesByTagId={lastWrites}
            selectedTagId={state.selectedTagId}
            changedTagIds={changedTagIds}
            nowMs={nowMs}
            staleAfterMs={staleAfterMs}
            scope={scope}
            pinnedTagIds={pinnedTagIds}
            trendWindow={tableTrendWindow}
            onTogglePinned={togglePinned}
            connected={state.connectionStatus.connected}
            search={search}
            pollingActive={state.pollingActive}
            onSearchChange={setSearch}
            onTogglePolling={togglePolling}
            onConnect={() => setConnectionOpen(true)}
            onSelect={selectTag}
            onEdit={setEditingTag}
            onRemove={removeTag}
          />
          {selectedTag ? (
            <TagInspector
              tag={selectedTag}
              snapshot={selectedSnapshot}
              history={tagHistory[selectedTag.id] ?? []}
              lastWrite={lastWrites[selectedTag.id]}
              nowMs={nowMs}
              staleAfterMs={staleAfterMs}
              onWrite={writeSelected}
              onClose={() =>
                setState((current) => ({ ...current, selectedTagId: undefined }))
              }
            />
          ) : null}
        </div>
      </div>
      <EventConsole
        events={state.events}
        collapsed={consoleCollapsed}
        onToggleCollapsed={() => setConsoleCollapsed((current) => !current)}
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
              <div className="modal-title" id="add-tag-title">
                Configure Tag
              </div>
              <button className="modal-close-button" type="button" onClick={() => setAddTagOpen(false)} aria-label="Close">
                X
              </button>
            </div>
            <TagEntryForm
              onAdd={addTag}
              onAdded={() => setAddTagOpen(false)}
              onCancel={() => setAddTagOpen(false)}
            />
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
              <div className="modal-title" id="edit-tag-title">
                Configure Tag
              </div>
              <button className="modal-close-button" type="button" onClick={() => setEditingTag(undefined)} aria-label="Close">
                X
              </button>
            </div>
            <TagEntryForm
              initialTag={editingTag}
              onAdd={updateTag}
              onAdded={() => setEditingTag(undefined)}
              onCancel={() => setEditingTag(undefined)}
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
              <div className="modal-title" id="connection-title">
                PLC Connection
              </div>
              <button className="modal-close-button" type="button" onClick={() => setConnectionOpen(false)} aria-label="Close">
                X
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
