import {
  formatDelta,
  InvestigationScope,
  runtimeStatus,
} from "../tagHistory";
import {
  ConnectionStatus,
  TagSnapshot,
  WatchedTag,
  WriteResult,
} from "../types";

export type RailIconName =
  | "add"
  | "discover"
  | "all"
  | "changing"
  | "errors"
  | "stale"
  | "written"
  | "pinned"
  | "settings";

export type ScopeOption = [InvestigationScope, string, number, RailIconName];

type Props = {
  collapsed: boolean;
  connectionStatus: ConnectionStatus;
  scope: InvestigationScope;
  scopeOptions: ScopeOption[];
  pinnedTags: WatchedTag[];
  snapshotsByTagId: Record<string, TagSnapshot>;
  lastWritesByTagId: Record<string, WriteResult>;
  selectedTagId?: string;
  nowMs: number;
  staleAfterMs: number;
  onToggleCollapsed: () => void;
  onSetScope: (scope: InvestigationScope) => void;
  onSelectTag: (tagId: string) => void;
  onAddTag: () => void;
  onDiscoverTags: () => void;
  onSaveSession: () => void;
  onClearHighlights: () => void;
  onConnectionSettings: () => void;
};

export function WorkflowSidebar({
  collapsed,
  connectionStatus,
  scope,
  scopeOptions,
  pinnedTags,
  snapshotsByTagId,
  lastWritesByTagId,
  selectedTagId,
  nowMs,
  staleAfterMs,
  onToggleCollapsed,
  onSetScope,
  onSelectTag,
  onAddTag,
  onDiscoverTags,
  onSaveSession,
  onClearHighlights,
  onConnectionSettings,
}: Props) {
  const connectionConfig = connectionStatus.config;

  return (
    <aside
      className={`left-sidebar ${collapsed ? "is-collapsed" : ""}`}
      aria-label="Workflow sidebar"
    >
      <div className="sidebar-topline">
        {!collapsed ? <span className="sidebar-heading">Connection</span> : null}
        <button
          className="sidebar-collapse-toggle"
          type="button"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={onToggleCollapsed}
        >
          {collapsed ? (
            <ChevronRightIcon />
          ) : (
            <>
              <span>Collapse</span>
              <ChevronLeftIcon />
            </>
          )}
        </button>
      </div>
      {collapsed ? (
        <div className="sidebar-rail" aria-label="Collapsed workflow actions">
          <div className="sidebar-rail-banner">Tools</div>
          <button
            className="rail-button primary-rail"
            type="button"
            disabled={!connectionStatus.connected}
            title="Add Tag"
            aria-label="Add Tag"
            data-tooltip="Add Tag"
            onClick={onAddTag}
          >
            <RailIcon name="add" />
          </button>
          <button
            className="rail-button"
            type="button"
            disabled={!connectionStatus.connected}
            title="Discover Tags"
            aria-label="Discover Tags"
            data-tooltip="Discover Tags"
            onClick={onDiscoverTags}
          >
            <RailIcon name="discover" />
          </button>
          <div className="rail-separator" aria-hidden="true" />
          {scopeOptions.map(([key, label, count, icon]) => (
            <button
              key={key}
              className={`rail-button scope-rail ${scope === key ? "is-selected" : ""}`}
              type="button"
              title={`${label} (${count})`}
              aria-label={`${label} scope, ${count}`}
              data-tooltip={`${label} (${count})`}
              onClick={() => onSetScope(key)}
            >
              <RailIcon name={icon} />
            </button>
          ))}
          <div className="rail-separator" aria-hidden="true" />
          <button
            className="rail-button rail-settings"
            type="button"
            title="Connection Settings"
            aria-label="Connection Settings"
            data-tooltip="Connection Settings"
            onClick={onConnectionSettings}
          >
            <RailIcon name="settings" />
          </button>
        </div>
      ) : (
        <>
          <section className="sidebar-section connection-section">
            <button
              className={`sidebar-connection ${
                connectionStatus.connected ? "is-connected" : "is-disconnected"
              }`}
              type="button"
              onClick={onConnectionSettings}
            >
              <span />
              <strong>{connectionStatus.connected ? "Connected" : "Disconnected"}</strong>
              <em>{connectionConfig?.address ?? "No PLC target"}</em>
              <em>{connectionConfig ? `Poll: ${connectionConfig.pollIntervalMs} ms` : "Poll: idle"}</em>
            </button>
          </section>
          <section className="sidebar-section">
            <div className="sidebar-heading">Primary</div>
            <div className="sidebar-actions primary-actions">
              <button
                className="tool-link primary-action"
                type="button"
                disabled={!connectionStatus.connected}
                onClick={onAddTag}
              >
                + Add Tag
              </button>
              <button
                className="tool-link"
                type="button"
                disabled={!connectionStatus.connected}
                onClick={onDiscoverTags}
              >
                Discover Tags
              </button>
            </div>
          </section>
          <section className="sidebar-section">
            <div className="sidebar-heading">Focus</div>
            <div className="scope-list">
              {scopeOptions.map(([key, label, count]) => (
                <button
                  key={key}
                  className={`scope-row ${scope === key ? "is-selected" : ""}`}
                  type="button"
                  onClick={() => onSetScope(key)}
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
                  const snapshot = snapshotsByTagId[tag.id];
                  const status = runtimeStatus(
                    snapshot,
                    lastWritesByTagId[tag.id],
                    nowMs,
                    staleAfterMs
                  );
                  const delta = formatDelta(snapshot?.currentValue, snapshot?.previousValue);
                  return (
                    <button
                      key={tag.id}
                      className={`pinned-row ${selectedTagId === tag.id ? "is-selected" : ""}`}
                      type="button"
                      onClick={() => onSelectTag(tag.id)}
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
          <section className="sidebar-section secondary-section">
            <div className="sidebar-heading">Secondary</div>
            <div className="sidebar-actions secondary-actions">
              <button className="tool-link" type="button" onClick={onSaveSession}>
                Save Session
              </button>
              <button className="tool-link" type="button" onClick={onClearHighlights}>
                Clear Highlights
              </button>
              <button className="tool-link" type="button" onClick={onConnectionSettings}>
                Connection Settings
              </button>
            </div>
          </section>
        </>
      )}
    </aside>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M10 3 5 8l5 5" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="m6 3 5 5-5 5" />
    </svg>
  );
}

function RailIcon({ name }: { name: RailIconName }) {
  switch (name) {
    case "add":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 4v12M4 10h12" />
        </svg>
      );
    case "discover":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="9" cy="9" r="5" />
          <path d="m13 13 3 3" />
        </svg>
      );
    case "all":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M5 5h10M5 10h10M5 15h10" />
        </svg>
      );
    case "changing":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3 11h3l2-5 4 9 2-4h3" />
        </svg>
      );
    case "errors":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 4v7" />
          <path d="M10 15h.01" />
          <path d="M10 2 2.8 17h14.4L10 2Z" />
        </svg>
      );
    case "stale":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="7" />
          <path d="M10 6v4l3 2" />
        </svg>
      );
    case "written":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M4 14.5V16h1.5L15 6.5 13.5 5 4 14.5Z" />
          <path d="m12.5 6 1.5 1.5" />
        </svg>
      );
    case "pinned":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="m10 3 2.1 4.3 4.7.7-3.4 3.3.8 4.7-4.2-2.2L5.8 16l.8-4.7L3.2 8l4.7-.7L10 3Z" />
        </svg>
      );
    case "settings":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="3" />
          <path d="M10 2.5v2M10 15.5v2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M2.5 10h2M15.5 10h2M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
        </svg>
      );
  }
}
