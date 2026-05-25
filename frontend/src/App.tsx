import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { AppHeader } from "./components/AppHeader";
import { ConnectionPanel } from "./components/ConnectionPanel";
import { DiscoverTagsModal } from "./components/DiscoverTagsModal";
import { EventConsole } from "./components/EventConsole";
import { LiveWatchTable } from "./components/LiveWatchTable";
import { TagEntryForm } from "./components/TagEntryForm";
import { TagInspector } from "./components/TagInspector";
import { WatchListModal } from "./components/WatchListModal";
import { ScopeOption, WorkflowSidebar } from "./components/WorkflowSidebar";
import { api } from "./services/api";
import { subscribeBackendEvents } from "./services/events";
import { applyThemeTokens, ThemeMode } from "./theme";
import {
  activityLevel,
  appendTagHistory,
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

const themeStorageKey = "pulso-theme";
const sidebarCollapsedStorageKey = "pulso-sidebar-collapsed";
const historySampleLimit = 1800;
const chartRefreshMs = 250;

function getInitialTheme(): ThemeMode {
  const savedTheme = window.localStorage.getItem(themeStorageKey);
  if (savedTheme === "dark" || savedTheme === "light") {
    return savedTheme;
  }
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function getInitialSidebarCollapsed() {
  return window.localStorage.getItem(sidebarCollapsedStorageKey) === "true";
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
  const [lastWrites, setLastWrites] = useState<Record<string, WriteResult>>({});
  const [addTagOpen, setAddTagOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<WatchedTag>();
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [discoveryProgress, setDiscoveryProgress] = useState<DiscoveryProgress>();
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [watchListOpen, setWatchListOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getInitialSidebarCollapsed);
  const [consoleCollapsed, setConsoleCollapsed] = useState(false);
  const changeTimersRef = useRef<Record<string, number>>({});
  const pendingSnapshotsRef = useRef<Record<string, TagSnapshot>>({});
  const snapshotFrameRef = useRef<number>();

  useEffect(() => {
    applyThemeTokens(theme);
    document.body.classList.toggle("theme-light", theme === "light");
    document.body.classList.toggle("theme-dark", theme === "dark");
    window.localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(sidebarCollapsedStorageKey, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), chartRefreshMs);
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
      },
      onTagSnapshot: (snapshot) => applySnapshot(snapshot),
      onTagChanged: (snapshot) => {
        markTagChanged(snapshot.tagId);
      },
      onTagError: (snapshot) => {
        applySnapshot(snapshot);
      },
      onWriteResult: (result) => {
        setLastWrites((current) => ({ ...current, [result.tagId]: result }));
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
  const scopeOptions: ScopeOption[] = [
    ["all", "All", state.watchedTags.length, "all"],
    ["changing", "Changing", scopedRows.filter((row) => row.activity.changes > 0).length, "changing"],
    ["errors", "Errors", scopedRows.filter((row) => row.status.label === "ERROR").length, "errors"],
    ["stale", "Stale", scopedRows.filter((row) => row.status.label === "STALE").length, "stale"],
    [
      "written",
      "Written",
      scopedRows.filter(
        (row) => row.status.label === "WRITTEN" || row.status.label === "OVERRIDDEN"
      ).length,
      "written",
    ],
    ["pinned", "Pinned", pinnedTagIds.size, "pinned"],
  ];
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
      <AppHeader
        connectionStatus={state.connectionStatus}
        theme={theme}
        onConnectionSettings={() => setConnectionOpen(true)}
        onToggleTheme={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
      />
      <div className={`app-body ${sidebarCollapsed ? "sidebar-is-collapsed" : ""}`}>
        <WorkflowSidebar
          collapsed={sidebarCollapsed}
          connectionStatus={state.connectionStatus}
          scope={scope}
          scopeOptions={scopeOptions}
          pinnedTags={pinnedTags}
          snapshotsByTagId={state.snapshotsByTagId}
          lastWritesByTagId={lastWrites}
          selectedTagId={state.selectedTagId}
          nowMs={nowMs}
          staleAfterMs={staleAfterMs}
          onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
          onSetScope={setScope}
          onSelectTag={selectTag}
          onAddTag={() => setAddTagOpen(true)}
          onDiscoverTags={() => setDiscoverOpen(true)}
          onSaveSession={() => setWatchListOpen(true)}
          onConnectionSettings={() => setConnectionOpen(true)}
        />
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
