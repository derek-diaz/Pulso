import { formatTimestamp, formatValue } from "../format";
import { countChanges, numericValue, sampleStats, TagHistorySample } from "../tagHistory";
import { TagDataType } from "../types";

type Props = {
  dataType: TagDataType;
  samples: TagHistorySample[];
  selected?: boolean;
  size?: "table" | "inspector";
  timeRange?: {
    startMs: number;
    endMs: number;
  };
};

export function InlineTrend({ dataType, samples, selected = false, size = "table", timeRange }: Props) {
  if (samples.length === 0) {
    return <span className="trend-empty-inline">no samples</span>;
  }

  if (dataType === "BOOL") {
    return <BoolTimeline samples={samples} selected={selected} size={size} timeRange={timeRange} />;
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

  return <Sparkline dataType={dataType} points={points} selected={selected} size={size} timeRange={timeRange} />;
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
    const transitions = stateTransitions(samples).slice(-4).reverse();
    if (transitions.length === 0) {
      return <div className="sample-summary">No samples yet</div>;
    }
    return (
      <div className="recent-values">
        {transitions.map((sample, index) => (
          <div className="recent-value-row" key={`${sample.timestamp}-${index}`}>
            <span>{formatTimestamp(sample.timestamp)}</span>
            <code title={formatValue(sample.value)}>{formatValue(sample.value)}</code>
          </div>
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
  timeRange,
}: {
  dataType: TagDataType;
  points: Array<{ timestamp: string; value: number }>;
  selected: boolean;
  size: "table" | "inspector";
  timeRange?: Props["timeRange"];
}) {
  const width = size === "inspector" ? 260 : 86;
  const height = size === "inspector" ? 46 : 22;
  const padding = size === "inspector" ? 4 : 2;
  const minValue = Math.min(...points.map((point) => point.value));
  const maxValue = Math.max(...points.map((point) => point.value));
  const valueRange = Math.max(maxValue - minValue, 1);
  const timeScale = buildTimeScale(
    points.map((point) => point.timestamp),
    timeRange,
    padding,
    width - padding
  );
  const maxIndex = Math.max(points.length - 1, 1);
  const plottedPoints = points.map((point, index) => {
    const x = timeScale(point.timestamp, index, maxIndex);
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

function BoolTimeline({
  samples,
  selected,
  size,
  timeRange,
}: {
  samples: TagHistorySample[];
  selected: boolean;
  size: "table" | "inspector";
  timeRange?: Props["timeRange"];
}) {
  const bucketCount = 24;
  const buckets = bucketBoolSamples(samples, bucketCount, timeRange);

  return (
    <div
      className={`bool-strip ${selected ? "is-selected" : ""} ${size}`}
      role="img"
      aria-label="Recent BOOL samples"
    >
      {buckets.map((bucket, index) => (
        <span
          key={`${bucket.timestamp ?? "empty"}-${index}`}
          className={bucket.value === true ? "is-true" : bucket.value === false ? "is-false" : "is-empty"}
          title={
            bucket.timestamp
              ? `${formatValue(bucket.value)} at ${bucket.timestamp}`
              : "No sample in this time slice"
          }
        />
      ))}
    </div>
  );
}

function bucketBoolSamples(
  samples: TagHistorySample[],
  bucketCount: number,
  timeRange: Props["timeRange"]
) {
  const parsedSamples = samples
    .map((sample) => ({ ...sample, timeMs: Date.parse(sample.timestamp) }))
    .filter((sample) => Number.isFinite(sample.timeMs))
    .sort((left, right) => left.timeMs - right.timeMs);
  const finiteTimes = parsedSamples.map((sample) => sample.timeMs);
  const startMs = timeRange?.startMs ?? Math.min(...finiteTimes);
  const endMs = timeRange?.endMs ?? Math.max(...finiteTimes);
  const timeSpan = endMs - startMs;

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || timeSpan <= 0) {
    return samples.slice(-bucketCount).map((sample) => ({
      value: sample.value,
      timestamp: sample.timestamp,
    }));
  }

  const buckets: Array<{ value?: unknown; timestamp?: string }> = Array.from(
    { length: bucketCount },
    () => ({})
  );
  let sampleIndex = 0;
  let latestSample: (typeof parsedSamples)[number] | undefined;

  while (sampleIndex < parsedSamples.length && parsedSamples[sampleIndex].timeMs <= startMs) {
    latestSample = parsedSamples[sampleIndex];
    sampleIndex += 1;
  }

  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
    const bucketEndMs = startMs + ((bucketIndex + 1) / bucketCount) * timeSpan;
    while (sampleIndex < parsedSamples.length && parsedSamples[sampleIndex].timeMs <= bucketEndMs) {
      latestSample = parsedSamples[sampleIndex];
      sampleIndex += 1;
    }
    if (latestSample) {
      buckets[bucketIndex] = {
        value: latestSample.value,
        timestamp: latestSample.timestamp,
      };
    }
  }

  return buckets;
}

function stateTransitions(samples: TagHistorySample[]): TagHistorySample[] {
  const transitions: TagHistorySample[] = [];
  samples.forEach((sample) => {
    const previous = transitions[transitions.length - 1];
    if (!previous || formatValue(previous.value) !== formatValue(sample.value)) {
      transitions.push(sample);
    }
  });
  return transitions;
}

function buildTimeScale(
  timestamps: string[],
  timeRange: Props["timeRange"],
  minX: number,
  maxX: number
) {
  const parsed = timestamps.map((timestamp) => Date.parse(timestamp));
  const finiteTimes = parsed.filter(Number.isFinite);
  const startMs = timeRange?.startMs ?? Math.min(...finiteTimes);
  const endMs = timeRange?.endMs ?? Math.max(...finiteTimes);
  const timeSpan = endMs - startMs;

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || timeSpan <= 0) {
    return (_timestamp: string, index: number, maxIndex: number) =>
      minX + (index / maxIndex) * (maxX - minX);
  }

  return (timestamp: string, index: number, maxIndex: number) => {
    const parsedTimestamp = Date.parse(timestamp);
    if (!Number.isFinite(parsedTimestamp)) {
      return minX + (index / maxIndex) * (maxX - minX);
    }
    const ratio = Math.min(1, Math.max(0, (parsedTimestamp - startMs) / timeSpan));
    return minX + ratio * (maxX - minX);
  };
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
