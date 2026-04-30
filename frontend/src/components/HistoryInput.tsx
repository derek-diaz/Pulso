import { useId, useRef, useState } from "react";

type Props = {
  label: string;
  value: string;
  history: string[];
  placeholder?: string;
  onChange: (value: string) => void;
};

export function HistoryInput({
  label,
  value,
  history,
  placeholder,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuId = useId();
  const options = history.filter((item) => item !== value);

  function selectValue(nextValue: string) {
    onChange(nextValue);
    setOpen(false);
    inputRef.current?.focus();
  }

  return (
    <label>
      {label}
      <div className="history-input">
        <button
          type="button"
          className="history-trigger"
          aria-label={`Show saved ${label}`}
          aria-expanded={open}
          aria-controls={menuId}
          disabled={history.length === 0}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOpen((current) => !current)}
        >
          <span aria-hidden="true" />
        </button>
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => {
            if (history.length > 0) {
              setOpen(true);
            }
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          placeholder={placeholder}
        />
        {open && options.length > 0 ? (
          <div className="history-menu" id={menuId} role="listbox">
            {options.map((item) => (
              <button
                key={item}
                type="button"
                className="history-option"
                role="option"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectValue(item)}
              >
                {item}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </label>
  );
}
