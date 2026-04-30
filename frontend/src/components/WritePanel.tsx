import { FormEvent, useState } from "react";
import { WatchedTag, WriteResult } from "../types";
import { formatValue } from "../format";
import { StatusBadge } from "./StatusBadge";

type Props = {
  tag: WatchedTag;
  lastWrite?: WriteResult;
  onWrite: (value: string) => Promise<void>;
};

export function WritePanel({ tag, lastWrite, onWrite }: Props) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const readOnly = tag.dataType === "STRUCT";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onWrite(value);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel-card write-card">
      <div className="section-title">Write Tool</div>
      {readOnly ? (
        <div className="inline-note">STRUCT tags are read-only raw payloads.</div>
      ) : null}
      <form className="stack" onSubmit={submit}>
        <label>
          New value for <code>{tag.name}</code>
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={tag.dataType === "BOOL" ? "true / false" : "value"}
            disabled={readOnly}
          />
        </label>
        <button className="primary" type="submit" disabled={busy || readOnly}>
          {busy ? "Writing + verifying" : "Write + Verify"}
        </button>
      </form>
      {lastWrite ? (
        <div className="write-result">
          <div className="section-title compact">
            <span>Last Write</span>
            <StatusBadge
              label={lastWrite.success ? "verified" : "failed"}
              tone={lastWrite.success ? "ok" : lastWrite.error ? "error" : "warn"}
            />
          </div>
          <dl className="inspector-grid">
            <dt>Requested</dt>
            <dd className="value-cell">{formatValue(lastWrite.requestedValue)}</dd>
            <dt>Previous</dt>
            <dd className="value-cell">{formatValue(lastWrite.previousValue)}</dd>
            <dt>Readback</dt>
            <dd className="value-cell">{formatValue(lastWrite.readbackValue)}</dd>
            <dt>Latency</dt>
            <dd>{lastWrite.latencyMs} ms</dd>
            <dt>Note</dt>
            <dd>{lastWrite.note}</dd>
            {lastWrite.error ? (
              <>
                <dt>Error</dt>
                <dd className="error-text">{lastWrite.error}</dd>
              </>
            ) : null}
          </dl>
        </div>
      ) : null}
    </section>
  );
}
