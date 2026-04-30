import { useState } from "react";
import { TagSnapshot, TrendPoint, WatchedTag, WriteResult } from "../types";
import { formatTimestamp, formatValue } from "../format";
import { StatusBadge } from "./StatusBadge";
import { WritePanel } from "./WritePanel";

type Props = {
  tag?: WatchedTag;
  snapshot?: TagSnapshot;
  history: TrendPoint[];
  lastWrite?: WriteResult;
  onWrite: (value: string) => Promise<void>;
  onClose: () => void;
};

export function TagInspector({ tag, snapshot, history, lastWrite, onWrite, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<"overview" | "trend" | "write">("overview");

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
        <div className="inspector-tabs" role="tablist" aria-label="Inspector sections">
          {[
            { id: "overview", label: "Overview" },
            { id: "trend", label: "Trend" },
            { id: "write", label: "Write" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={activeTab === tab.id ? "is-active" : ""}
              onClick={() => setActiveTab(tab.id as "overview" | "trend" | "write")}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>
      {activeTab === "overview" ? <OverviewPanel tag={tag} snapshot={snapshot} /> : null}
      {activeTab === "trend" ? <TrendPanel tag={tag} history={history} /> : null}
      {activeTab === "write" ? (
        <WritePanel tag={tag} lastWrite={lastWrite} onWrite={onWrite} />
      ) : null}
    </aside>
  );
}

function OverviewPanel({ tag, snapshot }: { tag: WatchedTag; snapshot?: TagSnapshot }) {
  return (
    <section className="panel-card inspector-card">
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
  );
}

function TrendPanel({ tag, history }: { tag: WatchedTag; history: TrendPoint[] }) {
  const trendable = tag.dataType !== "STRING" && tag.dataType !== "STRUCT";
  const [windowMs, setWindowMs] = useTrendWindow();
  const now = Date.now();
  const points = history.filter((point) => point.timestamp >= now - windowMs);
  const latest = points[points.length - 1];
  const min = points.length ? Math.min(...points.map((point) => point.value)) : undefined;
  const max = points.length ? Math.max(...points.map((point) => point.value)) : undefined;

  return (
    <section className="panel-card trend-card">
      <div className="section-title compact">
        <span>Trend</span>
        <div className="trend-window-tabs" role="group" aria-label="Trend time window">
          {[
            { label: "30s", value: 30_000 },
            { label: "2m", value: 120_000 },
            { label: "5m", value: 300_000 },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              className={windowMs === option.value ? "is-active" : ""}
              onClick={() => setWindowMs(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {!trendable ? (
        <div className="trend-empty">Trend is available for numeric and BOOL tags.</div>
      ) : points.length < 2 ? (
        <div className="trend-empty">Waiting for more samples.</div>
      ) : (
        <>
          <Sparkline points={points} />
          <div className="trend-stats">
            <span>
              <em>min</em>
              <strong>{formatTrendNumber(min)}</strong>
            </span>
            <span>
              <em>max</em>
              <strong>{formatTrendNumber(max)}</strong>
            </span>
            <span>
              <em>last</em>
              <strong>{formatTrendNumber(latest?.value)}</strong>
            </span>
          </div>
        </>
      )}
    </section>
  );
}

function Sparkline({ points }: { points: TrendPoint[] }) {
  const width = 260;
  const height = 84;
  const padding = 8;
  const minTime = points[0].timestamp;
  const maxTime = points[points.length - 1].timestamp;
  const minValue = Math.min(...points.map((point) => point.value));
  const maxValue = Math.max(...points.map((point) => point.value));
  const timeRange = Math.max(maxTime - minTime, 1);
  const valueRange = Math.max(maxValue - minValue, 1);
  const coordinates = points.map((point) => ({
    x: padding + ((point.timestamp - minTime) / timeRange) * (width - padding * 2),
    y: height - padding - ((point.value - minValue) / valueRange) * (height - padding * 2),
  }));
  const path = coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
  const lastPoint = coordinates[coordinates.length - 1];

  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Recent tag trend">
      <path className="sparkline-grid" d={`M ${padding} ${height - padding} H ${width - padding}`} />
      <path className="sparkline-path" d={path} />
      <circle className="sparkline-last" cx={lastPoint.x} cy={lastPoint.y} r="3" />
    </svg>
  );
}

function useTrendWindow(): [number, (value: number) => void] {
  const [windowMs, setWindowMs] = useState(120_000);
  return [windowMs, setWindowMs];
}

function formatTrendNumber(value: number | undefined): string {
  if (value === undefined) {
    return "unknown";
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(3);
}
