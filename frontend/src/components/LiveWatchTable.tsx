import { TagSnapshot, WatchedTag } from "../types";
import { StatusBadge } from "./StatusBadge";
import { formatTimestamp, formatValue, wasRecent } from "../format";

type Props = {
  tags: WatchedTag[];
  snapshotsByTagId: Record<string, TagSnapshot>;
  selectedTagId?: string;
  changedTagIds: Set<string>;
  connected: boolean;
  search: string;
  changedOnly: boolean;
  pollingActive: boolean;
  onSearchChange: (value: string) => void;
  onChangedOnlyChange: (value: boolean) => void;
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
  changedOnly,
  pollingActive,
  onSearchChange,
  onChangedOnlyChange,
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
    const snapshot = snapshotsByTagId[tag.id];
    const matchesSearch = tag.name.toLowerCase().includes(search.toLowerCase());
    const recentlyChanged =
      changedTagIds.has(tag.id) || wasRecent(snapshot?.lastChangedAt, 10000);
    return matchesSearch && (!changedOnly || recentlyChanged);
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
        <label className="toggle-line">
          <input
            type="checkbox"
            checked={changedOnly}
            onChange={(event) => onChangedOnlyChange(event.target.checked)}
          />
          changed recently
        </label>
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
                      <code>{tag.name}</code>
                    </td>
                    <td>{tag.dataType}</td>
                    <td className="value-cell">
                      {formatValue(snapshot?.currentValue)}
                    </td>
                    <td className="value-cell">
                      {formatValue(snapshot?.previousValue)}
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
