import { useMemo, useState } from "react";
import { TagSnapshot, WatchedTag, WriteResult } from "../types";
import { formatTimestamp, formatValue } from "../format";
import {
  activityLevel,
  formatDelta,
  runtimeStatus,
  samplesForWindow,
  TagHistorySample,
  TrendWindow,
} from "../tagHistory";
import { InlineTrend, SampleSummary } from "./InlineTrend";
import { StatusBadge } from "./StatusBadge";
import { WritePanel } from "./WritePanel";

type Props = {
  tag?: WatchedTag;
  snapshot?: TagSnapshot;
  history: TagHistorySample[];
  lastWrite?: WriteResult;
  nowMs: number;
  staleAfterMs: number;
  onWrite: (value: string) => Promise<void>;
  onClose: () => void;
};

export function TagInspector({
  tag,
  snapshot,
  history,
  lastWrite,
  nowMs,
  staleAfterMs,
  onWrite,
  onClose,
}: Props) {
  const [sampleWindow, setSampleWindow] = useState<TrendWindow>("30s");
  const visibleHistory = useMemo(
    () => samplesForWindow(history, sampleWindow, nowMs),
    [history, nowMs, sampleWindow]
  );

  if (!tag) {
    return null;
  }

  const statusDisplay = runtimeStatus(snapshot, lastWrite, nowMs, staleAfterMs);
  const activity = activityLevel(visibleHistory, snapshot, statusDisplay);
  const delta = formatDelta(snapshot?.currentValue, snapshot?.previousValue);

  return (
    <aside className="right-panel" aria-label="Inspector">
      <section className="panel-card inspector-card inspector-header-card">
        <div className="inspector-heading">
          <div>
            <span className="inspector-kicker">Inspector</span>
            <code title={tag.name}>{tag.name}</code>
          </div>
          <div className="inspector-title-actions">
            <StatusBadge label={statusDisplay.label} tone={statusDisplay.tone} />
            <button className="icon-button" type="button" onClick={onClose} aria-label="Close inspector">
              X
            </button>
          </div>
        </div>
      </section>

      <section className="panel-card inspector-card">
        <dl className="inspector-grid">
          <dt>Type</dt>
          <dd>{tag.dataType}</dd>
          <dt>Current</dt>
          <dd className="value-cell">{formatValue(snapshot?.currentValue)}</dd>
          <dt>Previous</dt>
          <dd className="value-cell">{formatValue(snapshot?.previousValue)}</dd>
          <dt>Delta</dt>
          <dd className={`delta-cell delta-${delta.tone}`}>{delta.label}</dd>
          <dt>Activity</dt>
          <dd>
            <span className={`activity-chip activity-${activity.tone}`}>{activity.label}</span>
          </dd>
          <dt>Last changed</dt>
          <dd>{formatTimestamp(snapshot?.lastChangedAt)}</dd>
          <dt>Last read</dt>
          <dd>{formatTimestamp(snapshot?.lastReadAt)}</dd>
          <dt>Latency</dt>
          <dd>
            {snapshot?.readLatencyMs !== undefined ? `${snapshot.readLatencyMs} ms` : "unknown"}
          </dd>
          <dt>Samples</dt>
          <dd>
            {visibleHistory.length}
            {visibleHistory.length !== history.length ? ` / ${history.length}` : ""}
          </dd>
          <dt>Last error</dt>
          <dd className={snapshot?.error ? "error-text" : ""}>{snapshot?.error || "none"}</dd>
        </dl>
      </section>

      <section className="panel-card inspector-card">
        <div className="inspector-sample-header">
          <div className="section-title">Recent samples</div>
          <div className="trend-window-control" role="group" aria-label="Inspector sample window">
            {(["10s", "30s", "1m", "5m"] as TrendWindow[]).map((option) => (
              <button
                key={option}
                type="button"
                className={sampleWindow === option ? "is-active" : ""}
                onClick={() => setSampleWindow(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        <InlineTrend
          key={`${tag.id}-${sampleWindow}`}
          dataType={tag.dataType}
          samples={visibleHistory}
          selected
          size="inspector"
        />
        <SampleSummary dataType={tag.dataType} samples={visibleHistory} size="inspector" />
      </section>

      <WritePanel tag={tag} lastWrite={lastWrite} onWrite={onWrite} />
    </aside>
  );
}
