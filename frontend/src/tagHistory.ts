import { formatValue } from "./format";
import { TagSnapshot, WriteResult } from "./types";

export type TagHistorySample = {
  timestamp: string;
  value: unknown;
};

export type TagHistory = Record<string, TagHistorySample[]>;

export type InvestigationScope = "all" | "changing" | "errors" | "stale" | "written" | "pinned";

export type TrendWindow = "10s" | "30s" | "1m" | "5m" | "all";

export type DeltaDisplay = {
  label: string;
  tone: "positive" | "negative" | "changed" | "neutral";
};

export type RuntimeStatus = {
  label: "LIVE" | "STALE" | "ERROR" | "WRITTEN" | "OVERRIDDEN" | "PENDING";
  tone: "ok" | "warn" | "error" | "neutral";
};

export type ActivityLevel = {
  label: "STATIC" | "LOW" | "MEDIUM" | "HIGH" | "BURSTING" | "STALE" | "ERROR";
  tone: "neutral" | "ok" | "warn" | "error";
  score: number;
  changes: number;
};

export function appendTagHistory(
  history: TagHistory,
  snapshot: TagSnapshot,
  limit = 60
): TagHistory {
  const timestamp = snapshot.lastReadAt || new Date().toISOString();
  const samples = history[snapshot.tagId] ?? [];
  const last = samples[samples.length - 1];

  if (last?.timestamp === timestamp && formatValue(last.value) === formatValue(snapshot.currentValue)) {
    return history;
  }

  return {
    ...history,
    [snapshot.tagId]: [...samples, { timestamp, value: snapshot.currentValue }].slice(-limit),
  };
}

export function samplesForWindow(
  samples: TagHistorySample[],
  window: TrendWindow,
  nowMs: number
): TagHistorySample[] {
  if (window === "all") {
    return samples;
  }
  const durationMs = trendWindowMs(window);
  const cutoff = nowMs - durationMs;
  const scoped = samples.filter((sample) => {
    const timestamp = Date.parse(sample.timestamp);
    return Number.isFinite(timestamp) && timestamp >= cutoff;
  });
  if (scoped.length > 0) {
    return scoped;
  }

  const fallbackCount = window === "10s" ? 12 : window === "30s" ? 24 : window === "1m" ? 40 : 60;
  return samples.slice(-fallbackCount);
}

export function trendWindowMs(window: TrendWindow): number {
  switch (window) {
    case "10s":
      return 10_000;
    case "30s":
      return 30_000;
    case "1m":
      return 60_000;
    case "5m":
      return 300_000;
    default:
      return Number.POSITIVE_INFINITY;
  }
}

export function numericValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  return undefined;
}

export function deltaValue(current: unknown, previous: unknown): number | undefined {
  const currentNumber = numericValue(current);
  const previousNumber = numericValue(previous);
  if (currentNumber === undefined || previousNumber === undefined) {
    return undefined;
  }
  return currentNumber - previousNumber;
}

export function formatDelta(current: unknown, previous: unknown): DeltaDisplay {
  if (typeof current === "boolean" || typeof previous === "boolean") {
    if (current === previous) {
      return { label: typeof current === "boolean" ? String(current) : "unchanged", tone: "neutral" };
    }
    return { label: `${formatValue(previous)} \u2192 ${formatValue(current)}`, tone: "changed" };
  }

  const delta = deltaValue(current, previous);
  if (delta !== undefined) {
    if (delta === 0) {
      return { label: "0", tone: "neutral" };
    }
    const magnitude = Math.abs(delta);
    const label = magnitude >= 1000 ? delta.toPrecision(4) : delta.toFixed(3);
    return {
      label: delta > 0 ? `+${label}` : label,
      tone: delta > 0 ? "positive" : "negative",
    };
  }

  if (current !== undefined && previous !== undefined) {
    return formatValue(current) === formatValue(previous)
      ? { label: "unchanged", tone: "neutral" }
      : { label: "changed", tone: "changed" };
  }

  return { label: "unknown", tone: "neutral" };
}

export function hasReadbackMismatch(write?: WriteResult): boolean {
  if (!write) {
    return false;
  }
  return formatValue(write.requestedValue) !== formatValue(write.readbackValue);
}

export function runtimeStatus(
  snapshot: TagSnapshot | undefined,
  lastWrite: WriteResult | undefined,
  nowMs: number,
  staleAfterMs: number
): RuntimeStatus {
  if (!snapshot) {
    return { label: "PENDING", tone: "neutral" };
  }
  if (snapshot.status === "error") {
    return { label: "ERROR", tone: "error" };
  }
  if (hasReadbackMismatch(lastWrite)) {
    return { label: "OVERRIDDEN", tone: "warn" };
  }

  const lastReadMs = Date.parse(snapshot.lastReadAt);
  if (Number.isFinite(lastReadMs) && nowMs - lastReadMs > staleAfterMs) {
    return { label: "STALE", tone: "warn" };
  }
  if (lastWrite?.success) {
    return { label: "WRITTEN", tone: "ok" };
  }
  return { label: "LIVE", tone: "ok" };
}

export function visibleRuntimeStatus(status: RuntimeStatus): RuntimeStatus | undefined {
  return status.label === "LIVE" ? undefined : status;
}

export function activityLevel(
  samples: TagHistorySample[],
  snapshot: TagSnapshot | undefined,
  status: RuntimeStatus
): ActivityLevel {
  if (status.label === "ERROR" || snapshot?.status === "error") {
    return { label: "ERROR", tone: "error", score: 600, changes: countChanges(samples) };
  }
  if (status.label === "STALE") {
    return { label: "STALE", tone: "warn", score: 500, changes: countChanges(samples) };
  }

  const changes = countChanges(samples);
  const alternations = countAlternations(samples);
  if (samples.length >= 8 && alternations >= Math.floor(samples.length * 0.55)) {
    return { label: "BURSTING", tone: "warn", score: 450, changes };
  }
  if (changes === 0) {
    return { label: "STATIC", tone: "neutral", score: 0, changes };
  }
  if (changes <= 2) {
    return { label: "LOW", tone: "neutral", score: 100 + changes, changes };
  }
  if (changes <= 6) {
    return { label: "MEDIUM", tone: "ok", score: 200 + changes, changes };
  }
  return { label: "HIGH", tone: "warn", score: 300 + changes, changes };
}

export function formatTableValue(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const magnitude = Math.abs(value);
    if (Number.isInteger(value)) {
      return String(value);
    }
    if (magnitude >= 1000000 || (magnitude > 0 && magnitude < 0.001)) {
      return value.toExponential(4);
    }
    return value.toLocaleString(undefined, {
      maximumFractionDigits: 4,
      minimumFractionDigits: 0,
      useGrouping: false,
    });
  }
  return formatValue(value);
}

export function sampleStats(samples: TagHistorySample[]) {
  const values = samples
    .map((sample) => numericValue(sample.value))
    .filter((value): value is number => value !== undefined);
  if (values.length === 0) {
    return undefined;
  }
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    current: values[values.length - 1],
  };
}

export function countChanges(samples: TagHistorySample[]): number {
  let changes = 0;
  for (let index = 1; index < samples.length; index += 1) {
    if (formatValue(samples[index].value) !== formatValue(samples[index - 1].value)) {
      changes += 1;
    }
  }
  return changes;
}

function countAlternations(samples: TagHistorySample[]): number {
  let alternations = 0;
  for (let index = 2; index < samples.length; index += 1) {
    const current = formatValue(samples[index].value);
    const previous = formatValue(samples[index - 1].value);
    const beforePrevious = formatValue(samples[index - 2].value);
    if (current === beforePrevious && current !== previous) {
      alternations += 1;
    }
  }
  return alternations;
}
