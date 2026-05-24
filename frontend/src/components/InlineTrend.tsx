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

  return <Sparkline dataType={dataType} points={points} selected={selected} size={size} />;
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
  dataType,
  points,
  selected,
  size,
}: {
  dataType: TagDataType;
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
  const plottedPoints = points.map((point, index) => {
    const x = padding + (index / maxIndex) * (width - padding * 2);
    const y = height - padding - ((point.value - minValue) / valueRange) * (height - padding * 2);
    return {
      x: Math.round(x * 2) / 2,
      y: Math.round(y * 2) / 2,
      value: point.value,
    };
  });
  const path = shouldUseStepPath(points, dataType)
    ? stepPath(plottedPoints)
    : linePath(plottedPoints);

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

function linePath(points: Array<{ x: number; y: number }>) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

function stepPath(points: Array<{ x: number; y: number }>) {
  return points
    .map((point, index, allPoints) => {
      if (index === 0) {
        return `M ${point.x} ${point.y}`;
      }
      const previous = allPoints[index - 1];
      const midX = Math.round(((previous.x + point.x) / 2) * 2) / 2;
      return `L ${midX} ${previous.y} L ${midX} ${point.y} L ${point.x} ${point.y}`;
    })
    .join(" ");
}

function shouldUseStepPath(points: Array<{ value: number }>, dataType: TagDataType) {
  if (dataType !== "REAL") {
    return true;
  }
  const uniqueValues = new Set(points.map((point) => point.value)).size;
  return uniqueValues <= Math.ceil(points.length * 0.55);
}

function formatTrendNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return Math.abs(value) >= 1000 ? value.toPrecision(5) : value.toFixed(3);
}
