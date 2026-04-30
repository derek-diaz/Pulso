import { TagSnapshot, WatchedTag, WriteResult } from "../types";
import { formatTimestamp, formatValue } from "../format";
import { StatusBadge } from "./StatusBadge";
import { WritePanel } from "./WritePanel";

type Props = {
  tag?: WatchedTag;
  snapshot?: TagSnapshot;
  lastWrite?: WriteResult;
  onWrite: (value: string) => Promise<void>;
  onClose: () => void;
};

export function TagInspector({ tag, snapshot, lastWrite, onWrite, onClose }: Props) {
  if (!tag) {
    return null;
  }

  const status = snapshot?.status ?? "pending";
  const tone =
    status === "ok" ? "ok" : status === "error" ? "error" : "pending";

  return (
    <aside className="right-panel">
      <section className="panel-card inspector-card">
        <div className="section-title">
          <span>Inspector</span>
          <div className="inspector-title-actions">
            <StatusBadge label={status} tone={tone} />
            <button className="icon-button" type="button" onClick={onClose} aria-label="Close inspector">
              X
            </button>
          </div>
        </div>
        <dl className="inspector-grid">
          <dt>Tag</dt>
          <dd>
            <code>{tag.name}</code>
          </dd>
          <dt>Type</dt>
          <dd>{tag.dataType}</dd>
          <dt>Current</dt>
          <dd className="value-cell">{formatValue(snapshot?.currentValue)}</dd>
          <dt>Previous</dt>
          <dd className="value-cell">{formatValue(snapshot?.previousValue)}</dd>
          <dt>Last read</dt>
          <dd>{formatTimestamp(snapshot?.lastReadAt)}</dd>
          <dt>Last changed</dt>
          <dd>{formatTimestamp(snapshot?.lastChangedAt)}</dd>
          <dt>Latency</dt>
          <dd>
            {snapshot?.readLatencyMs !== undefined
              ? `${snapshot.readLatencyMs} ms`
              : "unknown"}
          </dd>
          <dt>Last error</dt>
          <dd className={snapshot?.error ? "error-text" : ""}>
            {snapshot?.error || "none"}
          </dd>
        </dl>
      </section>
      <WritePanel tag={tag} lastWrite={lastWrite} onWrite={onWrite} />
    </aside>
  );
}
