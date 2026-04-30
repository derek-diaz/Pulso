import { useEffect, useRef, useState } from "react";
import { TagSnapshot, WatchedTag } from "../types";
import { StatusBadge } from "./StatusBadge";
import { formatTimestamp, formatValue } from "../format";

type Props = {
  tags: WatchedTag[];
  snapshotsByTagId: Record<string, TagSnapshot>;
  selectedTagId?: string;
  changedTagIds: Set<string>;
  connected: boolean;
  search: string;
  pollingActive: boolean;
  onSearchChange: (value: string) => void;
  onTogglePolling: () => void;
  onClearHighlights: () => void;
  onConnect: () => void;
  onAddTag: () => void;
  onDiscoverTags: () => void;
  onSelect: (tagId: string) => void;
  onEdit: (tag: WatchedTag) => void;
  onRemove: (tagId: string) => void;
};

export function LiveWatchTable({
  tags,
  snapshotsByTagId,
  selectedTagId,
  changedTagIds,
  connected,
  search,
  pollingActive,
  onSearchChange,
  onTogglePolling,
  onClearHighlights,
  onConnect,
  onAddTag,
  onDiscoverTags,
  onSelect,
  onEdit,
  onRemove,
}: Props) {
  const filteredTags = tags.filter((tag) => {
    return tag.name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <section className="center-panel">
      <div className="table-toolbar">
        <button className="primary" type="button" disabled={!connected} onClick={onAddTag}>
          Add Tag
        </button>
        <button className="secondary" type="button" disabled={!connected} onClick={onDiscoverTags}>
          Discover
        </button>
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search watched tags"
        />
        <button
          className={pollingActive ? "secondary" : "primary"}
          type="button"
          onClick={onTogglePolling}
        >
          {pollingActive ? "Pause polling" : "Resume polling"}
        </button>
        <button className="secondary" type="button" onClick={onClearHighlights}>
          Clear highlights
        </button>
      </div>
      <div className="table-shell">
        <table>
          <thead>
            <tr>
              <th>Tag</th>
              <th>Type</th>
              <th>Current Value</th>
              <th>Previous Value</th>
              <th>Last Changed</th>
              <th>Last Read</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTags.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty-row">
                  {tags.length === 0 ? (
                    <div className="empty-guide">
                      <strong>{connected ? "No watched tags yet" : "Connect to a PLC to begin"}</strong>
                      <span>
                        {connected
                          ? "Add a tag manually or discover controller tags from the toolbar."
                          : "Open the connection dialog, enter the PLC IP address and path, then add or discover tags."}
                      </span>
                      {!connected ? (
                        <button className="primary" type="button" onClick={onConnect}>
                          Connect PLC
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    "No watched tags match the current filters."
                  )}
                </td>
              </tr>
            ) : (
              filteredTags.map((tag) => {
                const snapshot = snapshotsByTagId[tag.id];
                const status = snapshot?.status ?? "pending";
                const tone =
                  status === "ok" ? "ok" : status === "error" ? "error" : "pending";
                const currentValue = formatValue(snapshot?.currentValue);
                const previousValue = formatValue(snapshot?.previousValue);
                return (
                  <tr
                    key={tag.id}
                    className={[
                      selectedTagId === tag.id ? "selected-row" : "",
                      changedTagIds.has(tag.id) ? "changed-row" : "",
                      status === "error" ? "error-row" : "",
                    ].join(" ")}
                    onClick={() => onSelect(tag.id)}
                  >
                    <td>
                      <div className="copyable-content">
                        <code>{tag.name}</code>
                        <CopyButton label="Copy tag name" value={tag.name} />
                      </div>
                    </td>
                    <td>{tag.dataType}</td>
                    <td className="value-cell">
                      <div className="copyable-content">
                        <span>{currentValue}</span>
                        <CopyButton label="Copy current value" value={currentValue} />
                      </div>
                    </td>
                    <td className="value-cell">
                      <div className="copyable-content">
                        <span>{previousValue}</span>
                        <CopyButton label="Copy previous value" value={previousValue} />
                      </div>
                    </td>
                    <td>{formatTimestamp(snapshot?.lastChangedAt)}</td>
                    <td>{formatTimestamp(snapshot?.lastReadAt)}</td>
                    <td>
                      <StatusBadge label={status} tone={tone} />
                    </td>
                    <td className="actions-cell">
                      <button
                        type="button"
                        className="secondary"
                        onClick={(event) => {
                          event.stopPropagation();
                          onEdit(tag);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={(event) => {
                          event.stopPropagation();
                          onRemove(tag.id);
                        }}
                      >
                        Remove
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
