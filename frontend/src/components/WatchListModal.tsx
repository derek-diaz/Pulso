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
              Watch Lists
            </div>
            <p className="modal-subtitle">{currentCount} tags in the current watch list</p>
          </div>
          <button className="modal-close-button" type="button" onClick={onClose} aria-label="Close">
            X
          </button>
        </div>

        <div className="watch-list-grid">
          <section className="watch-list-section">
            <h2>Import</h2>
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
                WL
              </div>
              <strong>Drop a watch-list file here</strong>
              <span>JSON or CSV. Import replaces the current list.</span>
              <button
                className="secondary"
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
            <p className="watch-list-note">
              Required CSV columns: <code>name</code> and <code>dataType</code>.
            </p>
          </section>

          <section className="watch-list-section">
            <h2>Export</h2>
            <p>Export this known-good set for review, backup, or sharing with another workstation.</p>
            <div className="watch-list-count-card">
              <span>Current list</span>
              <strong>{currentCount}</strong>
              <em>watched tags</em>
            </div>
            <div className="watch-list-export-actions">
              <button
                className="primary"
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
                JSON
              </button>
              <button
                className="secondary"
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
                CSV
              </button>
            </div>
            <p className="watch-list-note">
              JSON preserves app metadata. CSV is easier to edit in a spreadsheet.
            </p>
          </section>
        </div>

        {status ? <div className="watch-list-status">{status}</div> : null}
      </section>
    </div>
  );
}
