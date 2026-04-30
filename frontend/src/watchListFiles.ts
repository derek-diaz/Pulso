import { TagDataType, WatchedTag } from "./types";

export type WatchListFormat = "json" | "csv";

type WatchListPayload = {
  format?: string;
  version?: number;
  exportedAt?: string;
  tags?: unknown;
};

export async function parseWatchListFile(file: File): Promise<WatchedTag[]> {
  const text = await file.text();
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  if (file.name.toLowerCase().endsWith(".json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return parseJsonWatchList(trimmed);
  }
  return parseCsvWatchList(trimmed);
}

function parseJsonWatchList(text: string): WatchedTag[] {
  const payload = JSON.parse(text) as WatchListPayload | unknown[];
  const tags = Array.isArray(payload) ? payload : (payload as WatchListPayload).tags;
  if (!Array.isArray(tags)) {
    throw new Error("JSON watch list must be an array or an object with a tags array.");
  }
  return tags.map((tag, index) => coerceTag(tag, index + 1));
}

function parseCsvWatchList(text: string): WatchedTag[] {
  const rows = parseCsvRows(text).filter((row) => row.some((cell) => cell.trim() !== ""));
  if (rows.length === 0) {
    return [];
  }

  const header = rows[0].map((cell) => cell.trim());
  const indexes = new Map(header.map((name, index) => [name, index]));
  for (const column of ["name", "dataType"]) {
    if (!indexes.has(column)) {
      throw new Error(`CSV watch list is missing required column "${column}".`);
    }
  }

  return rows.slice(1).map((row, index) =>
    coerceTag(
      {
        id: readCsvCell(row, indexes, "id"),
        name: readCsvCell(row, indexes, "name"),
        dataType: readCsvCell(row, indexes, "dataType"),
        elementCount: readCsvCell(row, indexes, "elementCount"),
        elementSize: readCsvCell(row, indexes, "elementSize"),
      },
      index + 2
    )
  );
}

function readCsvCell(row: string[], indexes: Map<string, number>, column: string): string {
  const index = indexes.get(column);
  return index === undefined ? "" : row[index] ?? "";
}

function coerceTag(value: unknown, rowNumber: number): WatchedTag {
  if (!value || typeof value !== "object") {
    throw new Error(`Row ${rowNumber} is not a watch-list tag.`);
  }
  const source = value as Record<string, unknown>;
  const name = String(source.name ?? "").trim();
  const dataType = String(source.dataType ?? "").trim().toUpperCase() as TagDataType;
  const elementCount = numberFromUnknown(source.elementCount, 1);
  const elementSize = optionalNumberFromUnknown(source.elementSize);
  const id = String(source.id ?? "").trim();

  if (!name) {
    throw new Error(`Row ${rowNumber} is missing a tag name.`);
  }
  if (!dataType) {
    throw new Error(`Row ${rowNumber} is missing a data type.`);
  }

  return {
    id,
    name,
    dataType,
    elementCount,
    ...(elementSize === undefined ? {} : { elementSize }),
  };
}

function numberFromUnknown(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumberFromUnknown(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (quoted) {
    throw new Error("CSV watch list has an unterminated quoted field.");
  }

  row.push(cell);
  rows.push(row);
  return rows;
}
