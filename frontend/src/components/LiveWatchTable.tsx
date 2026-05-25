import { useEffect, useMemo, useRef, useState } from "react";
import { TagSnapshot, WatchedTag, WriteResult } from "../types";
import { formatValue } from "../format";
import {
  activityLevel,
  deltaValue,
  formatDelta,
  formatTableValue,
  InvestigationScope,
  numericValue,
  runtimeStatus,
  samplesForWindow,
  TagHistory,
  TrendWindow,
  trendWindowMs,
  visibleRuntimeStatus,
} from "../tagHistory";
import { InlineTrend } from "./InlineTrend";

type Props = {
  tags: WatchedTag[];
  snapshotsByTagId: Record<string, TagSnapshot>;
  historiesByTagId: TagHistory;
  lastWritesByTagId: Record<string, WriteResult>;
  selectedTagId?: string;
  changedTagIds: Set<string>;
  nowMs: number;
  staleAfterMs: number;
  scope: InvestigationScope;
  pinnedTagIds: Set<string>;
  trendWindow: TrendWindow;
  onTogglePinned: (tagId: string) => void;
  connected: boolean;
  search: string;
  pollingActive: boolean;
  onSearchChange: (value: string) => void;
  onTogglePolling: () => void;
  onConnect: () => void;
  onSelect: (tagId: string) => void;
  onEdit: (tag: WatchedTag) => void;
  onRemove: (tagId: string) => void;
};

type SortKey = "priority" | "name" | "activity" | "changes" | "current" | "delta" | "type";
type SortDirection = "asc" | "desc";

const sortOptions: Array<{ key: SortKey; label: string }> = [
  { key: "priority", label: "Interesting first" },
  { key: "activity", label: "Activity" },
  { key: "changes", label: "Recent changes" },
  { key: "name", label: "Tag name" },
  { key: "current", label: "Current value" },
  { key: "delta", label: "Delta" },
  { key: "type", label: "Type" },
];

export function LiveWatchTable({
  tags,
  snapshotsByTagId,
  historiesByTagId,
  lastWritesByTagId,
  selectedTagId,
  changedTagIds,
  nowMs,
  staleAfterMs,
  scope,
  pinnedTagIds,
  trendWindow,
  onTogglePinned,
  connected,
  search,
  pollingActive,
  onSearchChange,
  onTogglePolling,
  onConnect,
  onSelect,
  onEdit,
  onRemove,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const trendTimeRange = useMemo(() => {
    const durationMs = trendWindowMs(trendWindow);
    if (!Number.isFinite(durationMs)) {
      return undefined;
    }
    return {
      startMs: nowMs - durationMs,
      endMs: nowMs,
    };
  }, [nowMs, trendWindow]);
  const rowModels = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return tags
      .map((tag) => {
        const snapshot = snapshotsByTagId[tag.id];
        const allSamples = historiesByTagId[tag.id] ?? [];
        const samples = samplesForWindow(allSamples, trendWindow, nowMs);
        const write = lastWritesByTagId[tag.id];
        const status = runtimeStatus(snapshot, write, nowMs, staleAfterMs);
        const visibleStatus = visibleRuntimeStatus(status);
        const activity = activityLevel(samples, snapshot, status);
        const delta = formatDelta(snapshot?.currentValue, snapshot?.previousValue);
        return {
          tag,
          snapshot,
          samples,
          write,
          status,
          visibleStatus,
          activity,
          delta,
          trendSamples: tag.dataType === "BOOL" ? allSamples : samples,
          changed: changedTagIds.has(tag.id),
        };
      })
      .filter((row) => !needle || row.tag.name.toLowerCase().includes(needle))
      .filter((row) => matchesScope(row, scope, pinnedTagIds))
      .sort((left, right) => compareRows(left, right, sortKey, sortDirection));
  }, [
    changedTagIds,
    historiesByTagId,
    lastWritesByTagId,
    nowMs,
    pinnedTagIds,
    search,
    scope,
    snapshotsByTagId,
    sortDirection,
    sortKey,
    staleAfterMs,
    tags,
    trendWindow,
  ]);

  function updateSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === "name" || nextKey === "type" ? "asc" : "desc");
  }

  return (
    <section className="center-panel">
      <div className="table-toolbar">
        <div className="toolbar-left">
          <div className="table-title">
            <strong>Live Watch</strong>
          </div>
        </div>
        <div className="toolbar-right">
          <label className="search-field">
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search tags..."
            />
          </label>
          <label className="compact-select-label">
            Sort
            <select
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
            >
              {sortOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className={pollingActive ? "secondary" : "primary"}
            type="button"
            onClick={onTogglePolling}
          >
            {pollingActive ? "Pause" : "Resume"}
          </button>
        </div>
      </div>
      <div className="table-shell">
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>
                <button type="button" onClick={() => updateSort("name")}>
                  Tag
                </button>
              </th>
              <th>
                <button type="button" onClick={() => updateSort("type")}>
                  Type
                </button>
              </th>
              <th>
                <button type="button" onClick={() => updateSort("current")}>
                  Current Value
                </button>
              </th>
              <th>
                <button type="button" onClick={() => updateSort("delta")}>
                  Change / Delta
                </button>
              </th>
              <th>Trend</th>
              <th>
                <button type="button" onClick={() => updateSort("activity")}>
                  Activity
                </button>
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rowModels.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty-row">
                  {tags.length === 0 ? (
                    <div className="empty-guide">
                      <strong>{connected ? "No watched tags yet" : "Connect to a PLC to begin"}</strong>
                      <span>
                        {connected
                          ? "Add a tag manually or discover controller tags from the sidebar."
                          : "Open the connection dialog, enter the PLC IP address and path, then add or discover tags."}
                      </span>
                      {!connected ? (
                        <button className="primary" type="button" onClick={onConnect}>
                          Connect PLC
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    "No watched tags match the current scope."
                  )}
                </td>
              </tr>
            ) : (
              rowModels.map((row) => {
                const currentValue = formatTableValue(row.snapshot?.currentValue);
                const rawCurrentValue = formatValue(row.snapshot?.currentValue);
                return (
                  <tr
                    key={row.tag.id}
                    className={[
                      selectedTagId === row.tag.id ? "selected-row" : "",
                      row.changed ? "changed-row" : "",
                      row.status.label === "ERROR" ? "error-row" : "",
                      row.status.label === "STALE" ? "stale-row" : "",
                    ].join(" ")}
                    onClick={() => onSelect(row.tag.id)}
                  >
                    <td className="status-cell">
                      <span
                        className={`row-status-dot status-${row.status.tone}`}
                        title={row.visibleStatus?.label ?? "normal"}
                        aria-label={row.visibleStatus?.label ?? "normal"}
                      />
                      {row.visibleStatus ? (
                        <span className={`runtime-chip runtime-${row.visibleStatus.tone}`}>
                          {row.visibleStatus.label}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <div className="tag-cell">
                        <TagPath name={row.tag.name} />
                        <button
                          type="button"
                          className={`pin-button ${pinnedTagIds.has(row.tag.id) ? "is-pinned" : ""}`}
                          aria-label={`${pinnedTagIds.has(row.tag.id) ? "Unpin" : "Pin"} ${row.tag.name}`}
                          title={pinnedTagIds.has(row.tag.id) ? "Unpin tag" : "Pin tag"}
                          onClick={(event) => {
                            event.stopPropagation();
                            onTogglePinned(row.tag.id);
                          }}
                        >
                          <PinIcon />
                        </button>
                        <CopyButton label="Copy tag name" value={row.tag.name} />
                      </div>
                    </td>
                    <td>{row.tag.dataType}</td>
                    <td className={`value-cell ${row.changed ? "value-changed" : ""}`}>
                      <div className="copyable-content">
                        <span title={rawCurrentValue}>{currentValue}</span>
                        <CopyButton label="Copy current value" value={rawCurrentValue} />
                      </div>
                    </td>
                    <td className={`delta-cell delta-${row.delta.tone}`}>{row.delta.label}</td>
                    <td className="trend-cell">
                      <InlineTrend
                        dataType={row.tag.dataType}
                        samples={row.trendSamples}
                        selected={selectedTagId === row.tag.id}
                        timeRange={trendTimeRange}
                      />
                    </td>
                    <td>
                      <span
                        className={[
                          "activity-chip",
                          `activity-${row.activity.tone}`,
                          `activity-${row.activity.label.toLowerCase()}`,
                        ].join(" ")}
                      >
                        {row.activity.label}
                      </span>
                    </td>
                    <td className="actions-cell">
                      <button
                        type="button"
                        className="table-action-button secondary"
                        aria-label={`Edit ${row.tag.name}`}
                        title="Edit tag"
                        onClick={(event) => {
                          event.stopPropagation();
                          onEdit(row.tag);
                        }}
                      >
                        <EditIcon />
                      </button>
                      <button
                        type="button"
                        className="table-action-button danger"
                        aria-label={`Remove ${row.tag.name}`}
                        title="Remove tag"
                        onClick={(event) => {
                          event.stopPropagation();
                          onRemove(row.tag.id);
                        }}
                      >
                        <TrashIcon />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type RowModel = ReturnType<typeof buildRowModel>;

function buildRowModel(
  tag: WatchedTag,
  snapshot: TagSnapshot | undefined,
  samples: TagHistory[string],
  write: WriteResult | undefined,
  nowMs: number,
  staleAfterMs: number,
  changed: boolean
) {
  const status = runtimeStatus(snapshot, write, nowMs, staleAfterMs);
  return {
    tag,
    snapshot,
    samples,
    write,
    status,
    visibleStatus: visibleRuntimeStatus(status),
    activity: activityLevel(samples, snapshot, status),
    delta: formatDelta(snapshot?.currentValue, snapshot?.previousValue),
    changed,
  };
}

function matchesScope(row: RowModel, scope: InvestigationScope, pinnedTagIds: Set<string>) {
  switch (scope) {
    case "changing":
      return row.activity.changes > 0 || row.changed;
    case "errors":
      return row.status.label === "ERROR";
    case "stale":
      return row.status.label === "STALE";
    case "written":
      return row.status.label === "WRITTEN" || row.status.label === "OVERRIDDEN";
    case "pinned":
      return pinnedTagIds.has(row.tag.id);
    default:
      return true;
  }
}

function compareRows(left: RowModel, right: RowModel, sortKey: SortKey, direction: SortDirection) {
  const multiplier = direction === "asc" ? 1 : -1;
  let result = 0;
  switch (sortKey) {
    case "priority":
      result = priorityScore(left) - priorityScore(right);
      break;
    case "activity":
      result = left.activity.score - right.activity.score;
      break;
    case "changes":
      result = left.activity.changes - right.activity.changes;
      break;
    case "name":
      result = compareText(left.tag.name, right.tag.name);
      break;
    case "type":
      result = compareText(left.tag.dataType, right.tag.dataType);
      break;
    case "current":
      result = compareValue(left.snapshot?.currentValue, right.snapshot?.currentValue);
      break;
    case "delta":
      result = (deltaValue(left.snapshot?.currentValue, left.snapshot?.previousValue) ?? 0) -
        (deltaValue(right.snapshot?.currentValue, right.snapshot?.previousValue) ?? 0);
      break;
    default:
      result = 0;
  }
  return result === 0 ? compareText(left.tag.name, right.tag.name) : result * multiplier;
}

function priorityScore(row: RowModel) {
  const statusScore =
    row.status.label === "ERROR" || row.status.label === "OVERRIDDEN"
      ? 10000
      : row.status.label === "STALE"
      ? 8000
      : row.status.label === "WRITTEN"
      ? 6000
      : row.status.label === "PENDING"
      ? 4000
      : 0;
  return statusScore + row.activity.score + (row.changed ? 1000 : 0);
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function compareValue(left: unknown, right: unknown) {
  const leftNumber = numericValue(left);
  const rightNumber = numericValue(right);
  if (leftNumber !== undefined && rightNumber !== undefined) {
    return leftNumber - rightNumber;
  }
  return compareText(formatValue(left), formatValue(right));
}

function TagPath({ name }: { name: string }) {
  const lastDot = name.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === name.length - 1) {
    return <code title={name}>{name}</code>;
  }
  return (
    <code title={name}>
      <span className="tag-path-parent">{name.slice(0, lastDot)}</span>
      <span className="tag-path-leaf">{name.slice(lastDot)}</span>
    </code>
  );
}

function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number>();

  useEffect(() => {
    return () => {
      if (resetTimer.current !== undefined) {
        window.clearTimeout(resetTimer.current);
      }
    };
  }, []);

  return (
    <button
      type="button"
      className={`inline-copy ${copied ? "is-copied" : ""}`}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      onClick={async (event) => {
        event.stopPropagation();
        await copyText(value);
        setCopied(true);
        if (resetTimer.current !== undefined) {
          window.clearTimeout(resetTimer.current);
        }
        resetTimer.current = window.setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

function CopyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" focusable="false">
      <path d="M7 3.5h7.5v9H13v-7H7v-2Z" />
      <path d="M4.5 6.5H12v10H4.5v-10Zm1.5 1.5v7h4.5V8H6Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" focusable="false">
      <path d="M8.4 13.6 4.9 10l1.2-1.2 2.3 2.3 5.5-5.7 1.2 1.2-6.7 7Z" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" focusable="false">
      <path d="M13.8 3.2 16.8 6l-8.6 8.6-3.5.8.8-3.5 8.3-8.7Zm.1 2.1-7 7.3-.2.8.8-.2 7.1-7.1-.7-.8Z" />
      <path d="M4 16.5h12v1.4H4v-1.4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" focusable="false">
      <path d="M7.2 3h5.6l.7 1.7H17V6H3V4.7h3.5L7.2 3Zm1 .9-.3.8h4.2l-.3-.8H8.2Z" />
      <path d="M5 7h10l-.7 10H5.7L5 7Zm1.5 1.3.5 7.4h6l.5-7.4h-7ZM8.2 9.4h1.2v4.9H8.2V9.4Zm2.4 0h1.2v4.9h-1.2V9.4Z" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" focusable="false">
      <path d="M7.4 3.2h6l-.8 4.5 2.1 2.1v1.1h-4.1l-.7 5.9H8.8l-.7-5.9H4V9.8l2.2-2.1-.8-4.5Zm1.5 1.3.6 3.8-1.4 1.3h4.5l-1.3-1.3.6-3.8H8.9Z" />
    </svg>
  );
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}
