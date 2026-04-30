export function formatValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "unknown";
  }
  if (value === "") {
    return '""';
  }
  if (Array.isArray(value)) {
    return `[${value.map(formatValue).join(", ")}]`;
  }
  if (typeof value === "object") {
    if (isStructPayload(value)) {
      const suffix = value.truncated ? " ..." : "";
      return `${value.byteLength} bytes 0x${value.previewHex}${suffix}`;
    }
    return JSON.stringify(value);
  }
  return String(value);
}

function isStructPayload(value: object): value is {
  byteLength: number;
  previewHex: string;
  truncated: boolean;
} {
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.byteLength === "number" &&
    typeof payload.previewHex === "string" &&
    typeof payload.truncated === "boolean"
  );
}

export function formatTimestamp(value?: string): string {
  if (!value) {
    return "never";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString([], {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

export function wasRecent(value: string | undefined, windowMs: number): boolean {
  if (!value) {
    return false;
  }
  const timestamp = new Date(value).getTime();
  return !Number.isNaN(timestamp) && Date.now() - timestamp <= windowMs;
}
