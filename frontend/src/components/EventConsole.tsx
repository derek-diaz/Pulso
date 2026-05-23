import { useEffect, useMemo, useRef, useState } from "react";
import { AppEvent } from "../types";
import { formatTimestamp } from "../format";

type Props = {
  events: AppEvent[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onClear: () => void;
};

const levels: Array<AppEvent["level"] | "ALL"> = [
  "ALL",
  "INFO",
  "WARN",
  "ERROR",
  "DEBUG",
];

export function EventConsole({ events, collapsed, onToggleCollapsed, onClear }: Props) {
  const [level, setLevel] = useState<AppEvent["level"] | "ALL">("ALL");
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(
    () => events.filter((event) => level === "ALL" || event.level === level),
    [events, level]
  );

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered.length, autoScroll]);

  return (
    <section className={`bottom-panel ${collapsed ? "is-collapsed" : ""}`}>
      <div className="console-toolbar">
        <div className="console-title">
          <div className="section-title compact">Console</div>
          <span>{filtered.length} visible</span>
        </div>
        <div className="console-controls">
          <label className="select-label">
            Level
            <div className="select-control">
              <select
                value={level}
                onChange={(event) =>
                  setLevel(event.target.value as AppEvent["level"] | "ALL")
                }
              >
                {levels.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <label className="toggle-line">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(event) => setAutoScroll(event.target.checked)}
            />
            auto-scroll
          </label>
          <button className="secondary" type="button" onClick={onClear}>
            Clear
          </button>
          <button className="secondary" type="button" onClick={onToggleCollapsed}>
            {collapsed ? "Expand" : "Collapse"}
          </button>
        </div>
      </div>
      {!collapsed ? (
        <div className="console-log" ref={scrollRef}>
          {filtered.length === 0 ? (
            <div className="console-empty">No events recorded</div>
          ) : (
            filtered.map((event) => (
              <div key={event.id} className={`console-line level-${event.level}`}>
                <span>{formatTimestamp(event.timestamp)}</span>
                <strong>{event.level}</strong>
                <em>{event.type}</em>
                <code>{event.message}</code>
              </div>
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}
