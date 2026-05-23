import { formatValue } from "../format";
import { countChanges, numericValue, sampleStats, TagHistorySample } from "../tagHistory";
import { TagDataType } from "../types";

type Props = {
  dataType: TagDataType;
  samples: TagHistorySample[];
  selected?: boolean;
  size?: "table" | "inspector";
};

export function InlineTrend({ dataType, samples, selected = false, size = "table" }: Props) {
  if (samples.length === 0) {
    return <span className="trend-empty-inline">no samples</span>;
  }

  if (dataType === "BOOL") {
    return (
      <div className={`bool-strip ${size}`} aria-label="Recent BOOL samples">
        {samples.slice(-24).map((sample, index) => (
          <span
            key={`${sample.timestamp}-${index}`}
            className={sample.value === true ? "is-true" : "is-false"}
            title={`${formatValue(sample.value)} at ${sample.timestamp}`}
          />
        ))}
      </div>
    );
  }

  if (dataType === "STRING" || dataType === "STRUCT") {
    const changes = countChanges(samples);
    return (
      <span className={`change-count ${changes ? "has-changes" : ""}`}>
        {changes ? `${changes} changes` : "unchanged"}
      </span>
    );
  }

  const points = samples
    .map((sample) => ({ timestamp: sample.timestamp, value: numericValue(sample.value) }))
    .filter((point): point is { timestamp: string; value: number } => point.value !== undefined);

  if (points.length < 2) {
    return <span className="trend-empty-inline">warming</span>;
  }

  return <Sparkline points={points} selected={selected} size={size} />;
}

export function SampleSummary({ dataType, samples }: Props) {
  if (dataType === "BOOL") {
    return (
      <div className="sample-summary">
        <span>true</span>
        <strong>{samples.filter((sample) => sample.value === true).length}</strong>
        <span>false</span>
        <strong>{samples.filter((sample) => sample.value === false).length}</strong>
      </div>
    );
  }

  if (dataType === "STRING" || dataType === "STRUCT") {
    return (
      <div className="recent-values">
        {samples.slice(-4).map((sample, index) => (
          <code key={`${sample.timestamp}-${index}`}>{formatValue(sample.value)}</code>
        ))}
      </div>
    );
  }

  const stats = sampleStats(samples);
  if (!stats) {
    return <div className="sample-summary">No numeric samples yet</div>;
  }

  return (
    <div className="sample-summary">
      <span>min</span>
      <strong>{formatTrendNumber(stats.min)}</strong>
      <span>max</span>
      <strong>{formatTrendNumber(stats.max)}</strong>
      <span>current</span>
      <strong>{formatTrendNumber(stats.current)}</strong>
    </div>
  );
}

function Sparkline({
  points,
  selected,
  size,
}: {
  points: Array<{ timestamp: string; value: number }>;
  selected: boolean;
  size: "table" | "inspector";
}) {
  const width = size === "inspector" ? 260 : 86;
  const height = size === "inspector" ? 46 : 22;
  const padding = size === "inspector" ? 4 : 2;
  const minValue = Math.min(...points.map((point) => point.value));
  const maxValue = Math.max(...points.map((point) => point.value));
  const valueRange = Math.max(maxValue - minValue, 1);
  const maxIndex = Math.max(points.length - 1, 1);
  const path = points
    .map((point, index) => {
      const x = padding + (index / maxIndex) * (width - padding * 2);
      const y = height - padding - ((point.value - minValue) / valueRange) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      className={`inline-sparkline ${selected ? "is-selected" : ""} ${size}`}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Recent numeric trend"
    >
      <path d={path} />
    </svg>
  );
}

function formatTrendNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return Math.abs(value) >= 1000 ? value.toPrecision(5) : value.toFixed(3);
}
