import { FormEvent, useState } from "react";
import { useLocalHistory } from "../localHistory";
import { TagDataType, WatchedTag } from "../types";
import { HistoryInput } from "./HistoryInput";

const dataTypes: TagDataType[] = [
  "BOOL",
  "SINT",
  "INT",
  "DINT",
  "LINT",
  "REAL",
  "STRING",
];

type Props = {
  onAdd: (tag: WatchedTag) => Promise<void>;
  onAdded?: () => void;
  initialTag?: WatchedTag;
  submitLabel?: string;
};

export function TagEntryForm({ onAdd, onAdded, initialTag, submitLabel }: Props) {
  const [name, setName] = useState(initialTag?.name ?? "");
  const [dataType, setDataType] = useState<TagDataType>(initialTag?.dataType ?? "DINT");
  const [elementCount, setElementCount] = useState(initialTag?.elementCount ?? 1);
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(initialTag?.elementCount && initialTag.elementCount > 1));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tagPathHistory = useLocalHistory("pulso.tagPathHistory");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Tag path/name is required.");
      return;
    }
    setBusy(true);
    try {
      await onAdd({
        id: initialTag?.id ?? crypto.randomUUID(),
        name: trimmedName,
        dataType,
        elementCount: Math.max(1, elementCount || 1),
        elementSize: dataType === "STRUCT" ? initialTag?.elementSize : undefined,
      });
      tagPathHistory.remember(trimmedName);
      if (!initialTag) {
        setName("");
        setElementCount(1);
        setAdvancedOpen(false);
      }
      onAdded?.();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <HistoryInput
        label="Tag path/name"
        value={name}
        history={tagPathHistory.items}
        onChange={setName}
        placeholder="Motor.Speed"
      />
      <label>
        Type
        <div className="select-control">
          <select
            value={dataType}
            onChange={(event) => setDataType(event.target.value as TagDataType)}
          >
            {dataTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </label>
      <label className="advanced-toggle">
        <input
          type="checkbox"
          checked={advancedOpen}
          onChange={(event) => {
            setAdvancedOpen(event.target.checked);
            if (!event.target.checked) {
              setElementCount(1);
            }
          }}
        />
        array / advanced options
      </label>
      {advancedOpen ? (
        <div className="advanced-panel">
          <label>
            Array elements
            <input
              type="number"
              min={1}
              value={elementCount}
              onChange={(event) => setElementCount(Number(event.target.value))}
            />
          </label>
          <p>
            Use values above 1 only for array reads. Scalar tags should stay at 1.
          </p>
        </div>
      ) : null}
      {error ? <div className="inline-error">{error}</div> : null}
      <button className="primary" type="submit" disabled={busy}>
        {busy ? "Validating" : submitLabel ?? "Add to Watch"}
      </button>
    </form>
  );
}

function errorMessage(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === "string") {
    return value;
  }
  return "Tag could not be added.";
}
