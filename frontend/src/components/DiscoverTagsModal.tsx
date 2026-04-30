import { useEffect, useMemo, useState } from "react";
import { DiscoveredTag, DiscoveryProgress, WatchedTag } from "../types";

type Props = {
  onClose: () => void;
  onDiscover: () => Promise<DiscoveredTag[]>;
  progress?: DiscoveryProgress;
  onAdd: (tag: WatchedTag) => Promise<void>;
};

export function DiscoverTagsModal({ onClose, onDiscover, progress, onAdd }: Props) {
  const [tags, setTags] = useState<DiscoveredTag[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addingTag, setAddingTag] = useState("");
  const [addedTags, setAddedTags] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    onDiscover()
      .then((result) => {
        if (!cancelled) {
          setTags(result);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(errorMessage(caught));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [onDiscover]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return tags;
    }
    return tags.filter(
      (tag) =>
        tag.name.toLowerCase().includes(needle) ||
        tag.scope.toLowerCase().includes(needle) ||
        (tag.dataType ?? "").toLowerCase().includes(needle)
    );
  }, [query, tags]);

  async function addDiscovered(tag: DiscoveredTag) {
    if (!tag.watchable || !tag.dataType) {
      return;
    }
    setAddingTag(tag.name);
    setError("");
    try {
      await onAdd(watchedTagFromDiscovery(tag));
      setAddedTags((current) => new Set(current).add(tag.name));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setAddingTag("");
    }
  }

  async function addReadableFields(parent: DiscoveredTag) {
    const fields = readableFieldsFor(parent, tags).filter((tag) => !addedTags.has(tag.name));
    if (fields.length === 0) {
      return;
    }

    setAddingTag(parent.name);
    setError("");
    const added = new Set(addedTags);
    const failures: string[] = [];

    for (const field of fields) {
      try {
        await onAdd(watchedTagFromDiscovery(field));
        added.add(field.name);
      } catch (caught) {
        failures.push(`${field.name}: ${errorMessage(caught)}`);
      }
    }

    setAddedTags(added);
    setAddingTag("");
    if (failures.length > 0) {
      setError(failures.slice(0, 3).join(" | "));
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal-panel discovery-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="discover-tags-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div className="section-title compact" id="discover-tags-title">
            Discover Tags
          </div>
          <button className="secondary" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="discovery-toolbar">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search discovered tags"
          />
          <span>{filtered.length} shown</span>
        </div>
        {loading ? <DiscoveryProgressBar progress={progress} /> : null}
        {error ? <div className="inline-error">{error}</div> : null}
        <div className="discovery-list">
          {loading ? (
            <div className="empty-state">Discovering PLC tags...</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">No discovered tags match the current search.</div>
          ) : (
            filtered.map((tag) => {
              const added = addedTags.has(tag.name);
              const readableFields = readableFieldsFor(tag, tags);
              const addedFieldCount = readableFields.filter((field) => addedTags.has(field.name)).length;
              const allFieldsAdded = readableFields.length > 0 && addedFieldCount === readableFields.length;
              return (
                <div
                  key={`${tag.scope}:${tag.name}:${tag.rawType}`}
                  className={`discovery-row ${tag.watchable || readableFields.length ? "" : "is-unsupported"}`}
                >
                  <div className="discovery-main">
                    <code>{tag.name}</code>
                    <span>{tag.scope}</span>
                  </div>
                  <div className="discovery-meta">
                    <span>{tagTypeLabel(tag)}</span>
                    <span>{shapeLabel(tag)}</span>
                    <span>{tag.elementSize} B</span>
                  </div>
                  <div className="discovery-action">
                    {readableFields.length > 0 ? (
                      <div className="discovery-field-action">
                        <button
                          className={allFieldsAdded ? "secondary" : "primary"}
                          type="button"
                          disabled={allFieldsAdded || addingTag === tag.name}
                          onClick={() => addReadableFields(tag)}
                        >
                          {allFieldsAdded
                            ? "Added"
                            : addingTag === tag.name
                            ? "Adding"
                            : "Watch Fields"}
                        </button>
                        <span>{readableFields.length} fields</span>
                      </div>
                    ) : tag.watchable && !isStructuredType(tag.rawType) ? (
                      <button
                        className={added ? "secondary" : "primary"}
                        type="button"
                        disabled={added || addingTag === tag.name}
                        onClick={() => addDiscovered(tag)}
                      >
                        {added ? "Added" : addingTag === tag.name ? "Adding" : "Watch"}
                      </button>
                    ) : (
                      <span>{unsupportedLabel(tag)}</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

function watchedTagFromDiscovery(tag: DiscoveredTag): WatchedTag {
  const structured = isStructuredType(tag.rawType);
  return {
    id: crypto.randomUUID(),
    name: structured ? readableContainerName(tag) : tag.name,
    dataType: tag.dataType!,
    elementCount: structured ? 1 : Math.max(1, tag.elementCount || 1),
    elementSize: structured ? Math.max(1, tag.elementSize || 1) : undefined,
  };
}

function readableContainerName(tag: DiscoveredTag): string {
  const dimensions = tag.dimensions?.length ?? 0;
  if (dimensions > 0) {
    return `${tag.name}${zeroIndexSelector(dimensions)}`;
  }
  return tag.name;
}

function DiscoveryProgressBar({ progress }: { progress?: DiscoveryProgress }) {
  const [fallbackPct, setFallbackPct] = useState(6);
  const pct = progressPercent(progress, fallbackPct);

  useEffect(() => {
    setFallbackPct(6);
    const timer = window.setInterval(() => {
      setFallbackPct((current) => Math.min(90, current + (current < 50 ? 4 : 2)));
    }, 700);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="discovery-progress">
      <div className="discovery-progress-copy">
        <strong>{progress?.message ?? "Starting PLC discovery"}</strong>
        <span>{Math.round(pct)}%</span>
      </div>
      <div
        className="discovery-progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="discovery-progress-detail">
        {progress?.total && progress.total > 0
          ? `${progress.current} / ${progress.total}`
          : progress?.phase ?? "initializing"}
      </div>
    </div>
  );
}

function progressPercent(progress: DiscoveryProgress | undefined, fallbackPct: number): number {
  if (!progress) {
    return fallbackPct;
  }
  if (progress.phase === "complete") {
    return 100;
  }

  const [start, end] = progressRange(progress.phase);
  if (!progress.total || progress.total <= 0) {
    return start;
  }

  const fraction = Math.max(0, Math.min(1, progress.current / progress.total));
  return start + (end - start) * fraction;
}

function progressRange(phase: string): [number, number] {
  switch (phase) {
    case "start":
      return [3, 8];
    case "controller":
      return [8, 26];
    case "program":
      return [26, 42];
    case "udt":
      return [42, 84];
    case "members":
      return [84, 96];
    default:
      return [8, 92];
  }
}

function readableFieldsFor(parent: DiscoveredTag, tags: DiscoveredTag[]): DiscoveredTag[] {
  if (parent.watchable && !isStructuredType(parent.rawType)) {
    return [];
  }

  const prefixes = childPrefixes(parent);
  if (prefixes.length === 0) {
    return [];
  }

  return tags.filter(
    (tag) =>
      tag.watchable &&
      Boolean(tag.dataType) &&
      tag.dataType !== "STRUCT" &&
      prefixes.some((prefix) => tag.name.startsWith(prefix))
  );
}

function tagTypeLabel(tag: DiscoveredTag): string {
  if (isStructuredType(tag.rawType)) {
    return "UDT";
  }
  if (tag.dataType) {
    return tag.dataType;
  }
  return rawTypeLabel(tag.rawType);
}

function shapeLabel(tag: DiscoveredTag): string {
  if (isStructuredType(tag.rawType)) {
    return tag.dimensions?.length
      ? `UDT array ${tag.dimensions.join(" x ")}`
      : "UDT container";
  }
  return tag.dimensions?.length ? `array ${tag.dimensions.join(" x ")}` : "scalar";
}

function unsupportedLabel(tag: DiscoveredTag): string {
  if (isStructuredType(tag.rawType)) {
    const typeId = tag.typeId !== undefined ? ` type ${tag.typeId}` : "";
    const reason = tag.unsupportedReason ? `: ${tag.unsupportedReason}` : "";
    return `No member schema exposed${typeId}${reason}`;
  }
  return tag.unsupportedReason ?? "unsupported";
}

function isStructuredType(rawType: number): boolean {
  return (rawType & 0x8000) !== 0;
}

function childPrefixes(tag: DiscoveredTag): string[] {
  const dimensions = tag.dimensions?.length ?? 0;
  if (dimensions > 0) {
    return [`${tag.name}${zeroIndexSelector(dimensions)}.`];
  }
  return [`${tag.name}.`];
}

function zeroIndexSelector(dimensions: number): string {
  return `[${Array.from({ length: dimensions }, () => "0").join(",")}]`;
}

function rawTypeLabel(rawType: number): string {
  return `0x${rawType.toString(16).padStart(4, "0")}`;
}

function errorMessage(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === "string") {
    return value;
  }
  return "Tag discovery failed.";
}
