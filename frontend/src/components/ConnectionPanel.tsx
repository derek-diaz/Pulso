import { FormEvent, useState } from "react";
import { ConnectionConfig, ConnectionStatus } from "../types";
import { useLocalHistory } from "../localHistory";
import { HistoryInput } from "./HistoryInput";
import { StatusBadge } from "./StatusBadge";

type Props = {
  status: ConnectionStatus;
  onConnect: (config: ConnectionConfig) => Promise<void>;
  onDisconnect: () => Promise<void>;
  embedded?: boolean;
};

const defaultConfig: ConnectionConfig = {
  address: "192.168.1.10",
  path: "1,0",
  timeoutMs: 5000,
  pollIntervalMs: 200,
};

export function ConnectionPanel({ status, onConnect, onDisconnect, embedded = false }: Props) {
  const [config, setConfig] = useState<ConnectionConfig>(
    status.config ?? defaultConfig
  );
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const addressHistory = useLocalHistory("pulso.plcAddressHistory");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitError("");
    setBusy(true);
    try {
      await onConnect(config);
      addressHistory.remember(config.address);
      setEditing(false);
    } catch (caught) {
      setSubmitError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  const tone =
    status.state === "Connected"
      ? "ok"
      : status.state === "Error"
      ? "error"
      : status.state === "Connecting"
      ? "warn"
      : "neutral";

  if (status.connected && !editing) {
    return (
      <section className={embedded ? "connection-summary" : "panel-card connection-summary"}>
        {!embedded ? (
          <div className="section-title">
            <span>Connection</span>
            <StatusBadge label={status.state} tone={tone} />
          </div>
        ) : (
          <div className="status-line">
            <StatusBadge label={status.state} tone={tone} />
          </div>
        )}
        <dl className="connection-grid">
          <dt>Target</dt>
          <dd>{status.config?.address ?? config.address}</dd>
          <dt>Path</dt>
          <dd>{status.config?.path ?? config.path}</dd>
          <dt>Poll</dt>
          <dd>{status.config?.pollIntervalMs ?? config.pollIntervalMs} ms</dd>
        </dl>
        <div className="button-row">
          <button type="button" className="secondary" onClick={() => setEditing(true)}>
            Reconfigure
          </button>
          <button type="button" className="danger" onClick={onDisconnect}>
            Disconnect
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={embedded ? "" : "panel-card"}>
      {!embedded ? (
        <div className="section-title">
          <span>Connection</span>
          <StatusBadge label={status.state} tone={tone} />
        </div>
      ) : (
        <div className="status-line">
          <StatusBadge label={status.state} tone={tone} />
        </div>
      )}
      <form onSubmit={submit} className="stack">
        <HistoryInput
          label="PLC IP Address"
          value={config.address}
          history={addressHistory.items}
          onChange={(address) => setConfig({ ...config, address })}
          placeholder="192.168.1.10"
        />
        <label>
          PLC Path / Slot
          <input
            value={config.path}
            onChange={(event) =>
              setConfig({ ...config, path: event.target.value })
            }
            placeholder="1,0"
          />
        </label>
        <div className="split-fields">
          <label>
            Timeout ms
            <input
              type="number"
              min={100}
              value={config.timeoutMs}
              onChange={(event) =>
                setConfig({ ...config, timeoutMs: Number(event.target.value) })
              }
            />
          </label>
          <label>
            Poll ms
            <input
              type="number"
              min={50}
              value={config.pollIntervalMs}
              onChange={(event) =>
                setConfig({
                  ...config,
                  pollIntervalMs: Number(event.target.value),
                })
              }
            />
          </label>
        </div>
        {status.error || submitError ? (
          <div className="inline-error">{status.error || submitError}</div>
        ) : null}
        <div className="button-row">
          <button className="primary" type="submit" disabled={busy || status.connected}>
            {busy ? "Connecting" : "Connect"}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!status.connected}
            onClick={() => {
              if (status.connected) {
                setEditing(false);
              } else {
                onDisconnect();
              }
            }}
          >
            {status.connected ? "Cancel" : "Disconnect"}
          </button>
        </div>
      </form>
    </section>
  );
}

function errorMessage(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === "string") {
    return value;
  }
  return "Connection failed.";
}
