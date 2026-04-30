type StatusBadgeProps = {
  label: string;
  tone?: "neutral" | "ok" | "warn" | "error" | "pending";
};

export function StatusBadge({ label, tone = "neutral" }: StatusBadgeProps) {
  return <span className={`status-badge status-${tone}`}>{label}</span>;
}
