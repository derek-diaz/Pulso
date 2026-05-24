import { ConnectionStatus } from "../types";
import { ThemeMode } from "../theme";
import pulsoLogo from "../assets/images/pulso-logo.png";

type Props = {
  connectionStatus: ConnectionStatus;
  theme: ThemeMode;
  onConnectionSettings: () => void;
  onToggleTheme: () => void;
  onSavedSessions: () => void;
};

export function AppHeader({
  connectionStatus,
  theme,
  onConnectionSettings,
  onToggleTheme,
  onSavedSessions,
}: Props) {
  const connectionConfig = connectionStatus.config;

  return (
    <header className="app-header">
      <div className="brand-block">
        <div className="brand-row">
          <img
            className="brand-mark"
            src={pulsoLogo}
            alt="Pulso logo"
          />
          <h1>Pulso</h1>
        </div>
      </div>
      <div className="header-actions">
        <button
          className={`connection-chip ${
            connectionStatus.connected ? "is-connected" : "is-disconnected"
          }`}
          type="button"
          onClick={onConnectionSettings}
        >
          <span />
          <strong>{connectionStatus.connected ? "Connected" : "Connect"}</strong>
        </button>
        <div className="connection-details" aria-label="PLC connection details">
          <span>{connectionConfig?.address ?? "No PLC target"}</span>
          <span>{connectionConfig ? `${connectionConfig.pollIntervalMs} ms poll` : "polling idle"}</span>
        </div>
        <button
          className="theme-toggle"
          type="button"
          aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          aria-pressed={theme === "light"}
          title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          onClick={onToggleTheme}
        >
          {theme === "light" ? <MoonIcon /> : <SunIcon />}
        </button>
        <button className="header-tool" type="button" onClick={onSavedSessions}>
          Saved Sessions
        </button>
      </div>
    </header>
  );
}

function SunIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" focusable="false">
      <path d="M10 2.2h1v2.3h-1V2.2ZM10 15.5h1v2.3h-1v-2.3ZM2.2 10h2.3v1H2.2v-1ZM15.5 10h2.3v1h-2.3v-1ZM4.1 4.8l.7-.7 1.6 1.6-.7.7-1.6-1.6ZM14.6 15.3l.7-.7 1.6 1.6-.7.7-1.6-1.6ZM14.6 5.7l1.6-1.6.7.7-1.6 1.6-.7-.7ZM4.1 16.2l1.6-1.6.7.7-1.6 1.6-.7-.7ZM10.5 6.2a4.3 4.3 0 1 1 0 8.6 4.3 4.3 0 0 1 0-8.6Zm0 1.4a2.9 2.9 0 1 0 0 5.8 2.9 2.9 0 0 0 0-5.8Z" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" focusable="false">
      <path d="M13.7 15.4A6.6 6.6 0 0 1 8.1 4.7a5.2 5.2 0 1 0 7.2 7.2 6.5 6.5 0 0 1-1.6 3.5Zm-3.2 1.4a6.6 6.6 0 0 0 6.3-8.7l-.5-1.4-.9 1.2a3.8 3.8 0 0 1-6.1-4.4l.8-1.2-1.4.2a6.6 6.6 0 0 0 1.8 14.3Z" />
    </svg>
  );
}
