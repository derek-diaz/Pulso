import { FormEvent, useEffect, useState } from "react";
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
  const { items: addressHistoryItems, remember: rememberAddress } = useLocalHistory(
    "pulso.plcAddressHistory"
  );

  useEffect(() => {
    if (status.config?.address) {
      rememberAddress(status.config.address);
    }
  }, [rememberAddress, status.config?.address]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitError("");
    setBusy(true);
    rememberAddress(config.address);
    try {
      await onConnect(config);
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
        ) : null}
        {embedded ? (
          <div className="status-line">
            <StatusBadge label={status.state} tone={tone} />
          </div>
        ) : null}
        <dl className="connection-grid">
          <dt>Target</dt>
          <dd>{status.config?.address ?? config.address}</dd>
          <dt>Path</dt>
          <dd>{status.config?.path ?? config.path}</dd>
          <dt>Poll</dt>
          <dd>{status.config?.pollIntervalMs ?? config.pollIntervalMs} ms</dd>
        </dl>
        <div className={embedded ? "modal-action-row" : "button-row"}>
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
    <section className={embedded ? "connection-form" : "panel-card"}>
      {!embedded ? (
        <div className="section-title">
          <span>Connection</span>
          <StatusBadge label={status.state} tone={tone} />
        </div>
      ) : null}
      <form onSubmit={submit} className="stack">
        <div className="connection-warning" role="note">
          <WarningIcon />
          <div>
            <strong>Use extreme caution</strong>
            <span>
              Once connected, Pulso allows writes to the PLC. Verify the target controller,
              tag, and machine state before writing any value.
            </span>
          </div>
        </div>
        <HistoryInput
          label="PLC IP Address"
          value={config.address}
          history={addressHistoryItems}
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
        <div className={embedded ? "modal-action-row" : "button-row"}>
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

function WarningIcon() {
  return (
    <svg className="connection-warning-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M10 2.6 18 17H2L10 2.6Zm0 3.4-5.4 9.7h10.8L10 6Zm-.7 2.7h1.4v4.2H9.3V8.7Zm0 5.2h1.4v1.4H9.3v-1.4Z" />
    </svg>
  );
}
