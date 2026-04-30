import { useCallback, useEffect, useState } from "react";

const maxHistoryItems = 20;

export function useLocalHistory(key: string) {
  const [items, setItems] = useState<string[]>(() => readHistory(key));

  useEffect(() => {
    setItems(readHistory(key));
  }, [key]);

  const remember = useCallback(
    (value: string) => {
      const normalized = value.trim();
      if (!normalized) {
        return;
      }
      setItems((current) => {
        const next = [
          normalized,
          ...current.filter((item) => item.toLowerCase() !== normalized.toLowerCase()),
        ].slice(0, maxHistoryItems);
        writeHistory(key, next);
        return next;
      });
    },
    [key]
  );

  return { items, remember };
}

function readHistory(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function writeHistory(key: string, items: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // Local history is a convenience; storage failures should not block the workflow.
  }
}
