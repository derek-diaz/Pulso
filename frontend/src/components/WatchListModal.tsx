import { useRef, useState } from "react";
import { WatchListImportResult } from "../types";
import { WatchListFormat } from "../watchListFiles";

type Props = {
  currentCount: number;
  onClose: () => void;
  onImport: (file: File) => Promise<WatchListImportResult | undefined>;
  onExport: (format: WatchListFormat) => Promise<string | undefined>;
};

export function WatchListModal({ currentCount, onClose, onImport, onExport }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [status, setStatus] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function importFile(file: File) {
    setBusy(true);
    setStatus(`Reading ${file.name}...`);
    try {
      const result = await onImport(file);
      if (result) {
        const skipped = result.errors?.length ? ` Skipped ${result.errors.length} invalid rows.` : "";
        setStatus(`Imported ${result.imported} tags.${skipped}`);
      } else {
        setStatus("Import canceled.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not import watch list.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal-panel watch-list-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="watch-list-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <div className="modal-title" id="watch-list-title">
              Import / Export
            </div>
            <p className="modal-subtitle">Move watch lists between workstations or edit them offline.</p>
          </div>
          <button className="modal-close-button" type="button" onClick={onClose} aria-label="Close">
            X
          </button>
        </div>

        <div className="watch-list-grid">
          <section className="watch-list-section">
            <div className="watch-list-section-heading">
              <ImportIcon />
              <div>
                <h2>Import Watch List</h2>
                <p>Replace the current list with a JSON or CSV file.</p>
              </div>
            </div>
            <div
              className={`drop-zone ${dragActive ? "is-active" : ""}`}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setDragActive(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragActive(false);
                const file = event.dataTransfer.files?.[0];
                if (file) {
                  void importFile(file);
                }
              }}
            >
              <div className="drop-zone-mark" aria-hidden="true">
                <ImportIcon />
              </div>
              <strong>Drop JSON or CSV here</strong>
              <span>{currentCount > 0 ? `This will replace ${currentCount} current tags.` : "This starts a new watch list."}</span>
              <button
                className="primary"
                type="button"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                Browse File
              </button>
              <input
                ref={fileInputRef}
                className="file-input"
                type="file"
                accept=".json,.csv,application/json,text/csv"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file) {
                    void importFile(file);
                  }
                }}
              />
            </div>
            <div className="watch-list-format-row" aria-label="Supported import formats">
              <span>JSON</span>
              <span>CSV</span>
            </div>
            <p className="watch-list-note">
              Required CSV columns: <code>name</code> and <code>dataType</code>.
            </p>
          </section>

          <section className="watch-list-section">
            <div className="watch-list-section-heading">
              <ExportIcon />
              <div>
                <h2>Export Current List</h2>
                <p>Save this known-good set for backup, review, or sharing.</p>
              </div>
            </div>
            <div className="watch-list-count-card">
              <span>Current watch list</span>
              <strong>{currentCount}</strong>
              <em>watched tags</em>
            </div>
            <div className="watch-list-export-actions">
              <button
                className="export-format-button primary"
                type="button"
                disabled={currentCount === 0 || busy}
                onClick={() => {
                  setBusy(true);
                  setStatus("Choosing a JSON export location...");
                  void onExport("json")
                    .then((path) => setStatus(path ? `Exported JSON to ${path}` : "Export canceled."))
                    .catch((error) =>
                      setStatus(error instanceof Error ? error.message : "Could not export JSON.")
                    )
                    .finally(() => setBusy(false));
                }}
              >
                <strong>JSON</strong>
                <span>Best backup format</span>
              </button>
              <button
                className="export-format-button secondary"
                type="button"
                disabled={currentCount === 0 || busy}
                onClick={() => {
                  setBusy(true);
                  setStatus("Choosing a CSV export location...");
                  void onExport("csv")
                    .then((path) => setStatus(path ? `Exported CSV to ${path}` : "Export canceled."))
                    .catch((error) =>
                      setStatus(error instanceof Error ? error.message : "Could not export CSV.")
                    )
                    .finally(() => setBusy(false));
                }}
              >
                <strong>CSV</strong>
                <span>Spreadsheet editable</span>
              </button>
            </div>
          </section>
        </div>

        {status ? <div className="watch-list-status">{status}</div> : null}
      </section>
    </div>
  );
}

function ImportIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M10 3v9" />
      <path d="m6.5 8.5 3.5 3.5 3.5-3.5" />
      <path d="M4 14.5h12" />
      <path d="M4 16.5h12" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M10 16V7" />
      <path d="M6.5 10.5 10 7l3.5 3.5" />
      <path d="M4 14.5h12" />
      <path d="M4 16.5h12" />
    </svg>
  );
}
