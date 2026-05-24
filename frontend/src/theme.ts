export type ThemeMode = "dark" | "light";

type TokenGroup = Record<string, string>;

type ThemeDefinition = {
  background: TokenGroup;
  surface: TokenGroup;
  text: TokenGroup;
  border: TokenGroup;
  telemetry: TokenGroup;
  trend: TokenGroup;
  activity: TokenGroup;
  status: TokenGroup;
  action: TokenGroup;
  chrome: TokenGroup;
};

export const theme: Record<ThemeMode, ThemeDefinition> = {
  dark: {
    background: {
      primary: "#0F1115",
      secondary: "#12161B",
      elevated: "#161B22",
      console: "#0D1117",
      overlay: "rgba(8, 10, 14, 0.72)",
    },
    surface: {
      default: "#161B22",
      raised: "#1A2028",
      hover: "rgba(191, 201, 209, 0.07)",
      selected: "rgba(191, 201, 209, 0.075)",
      active: "rgba(255, 155, 81, 0.16)",
      control: "#121820",
      tableHead: "#141A21",
      rowHover: "rgba(191, 201, 209, 0.045)",
    },
    text: {
      primary: "#DCE4E6",
      strong: "#EAEFEF",
      secondary: "#BFC9D1",
      muted: "#87939D",
      disabled: "#60707B",
      inverse: "#151A1F",
    },
    border: {
      subtle: "rgba(191, 201, 209, 0.10)",
      default: "rgba(191, 201, 209, 0.16)",
      strong: "rgba(191, 201, 209, 0.24)",
    },
    telemetry: {
      neutral: "#7B8993",
      selected: "#FF9B51",
      active: "#D78B52",
      stale: "#6F818C",
      error: "#D46A6A",
      written: "#FF9B51",
      booleanTrue: "#6E9178",
      booleanFalse: "#3B4851",
    },
    trend: {
      default: "#687782",
      selected: "#FF9B51",
      positive: "#789781",
      negative: "#D17878",
      inactive: "#4C5963",
    },
    activity: {
      static: "#6D7A84",
      low: "#6E9178",
      medium: "#C9955F",
      high: "#D78B52",
      bursting: "#D46A6A",
    },
    status: {
      success: "#6E9178",
      warning: "#C9955F",
      error: "#D46A6A",
      info: "#8AA0B3",
      pending: "#83909A",
    },
    action: {
      primary: "#FF9B51",
      primaryHover: "#F4A15F",
      primaryMuted: "rgba(255, 155, 81, 0.14)",
      focus: "rgba(255, 155, 81, 0.55)",
      dangerMuted: "rgba(212, 106, 106, 0.10)",
    },
    chrome: {
      header: "#12161B",
      sidebar: "#12161B",
      toolbar: "#141A21",
      scrollbarTrack: "#0D1117",
      scrollbarThumb: "#38464F",
    },
  },
  light: {
    background: {
      primary: "#EAEFEF",
      secondary: "#E4EAEC",
      elevated: "#F2F5F5",
      console: "#E2E7E8",
      overlay: "rgba(37, 52, 63, 0.28)",
    },
    surface: {
      default: "#F6F8F8",
      raised: "#EEF2F3",
      hover: "rgba(37, 52, 63, 0.055)",
      selected: "rgba(37, 52, 63, 0.07)",
      active: "rgba(255, 155, 81, 0.20)",
      control: "#EDF2F3",
      tableHead: "#E7EDEE",
      rowHover: "rgba(37, 52, 63, 0.04)",
    },
    text: {
      primary: "#25343F",
      strong: "#17232C",
      secondary: "#52616C",
      muted: "#6F7E89",
      disabled: "#9AA6AD",
      inverse: "#151A1F",
    },
    border: {
      subtle: "rgba(37, 52, 63, 0.10)",
      default: "rgba(37, 52, 63, 0.16)",
      strong: "rgba(37, 52, 63, 0.24)",
    },
    telemetry: {
      neutral: "#697884",
      selected: "#D97735",
      active: "#C56D30",
      stale: "#84929B",
      error: "#B85F5F",
      written: "#D97735",
      booleanTrue: "#587D63",
      booleanFalse: "#BFC9D1",
    },
    trend: {
      default: "#7E8B95",
      selected: "#D97735",
      positive: "#587D63",
      negative: "#B85F5F",
      inactive: "#AAB5BC",
    },
    activity: {
      static: "#75828C",
      low: "#587D63",
      medium: "#A97342",
      high: "#C56D30",
      bursting: "#B85F5F",
    },
    status: {
      success: "#587D63",
      warning: "#A97342",
      error: "#B85F5F",
      info: "#647C91",
      pending: "#75828C",
    },
    action: {
      primary: "#FF9B51",
      primaryHover: "#E88943",
      primaryMuted: "rgba(255, 155, 81, 0.16)",
      focus: "rgba(217, 119, 53, 0.48)",
      dangerMuted: "rgba(184, 95, 95, 0.10)",
    },
    chrome: {
      header: "#F2F5F5",
      sidebar: "#E7ECEE",
      toolbar: "#EEF2F3",
      scrollbarTrack: "#DDE4E6",
      scrollbarThumb: "#9AA8B1",
    },
  },
};

export function applyThemeTokens(mode: ThemeMode) {
  const tokens = theme[mode];
  const root = document.documentElement;
  Object.entries(flattenTokens(tokens)).forEach(([name, value]) => {
    root.style.setProperty(`--${name}`, value);
  });
}

function flattenTokens(tokens: ThemeDefinition): Record<string, string> {
  return {
    "bg-primary": tokens.background.primary,
    "bg-secondary": tokens.background.secondary,
    "bg-elevated": tokens.background.elevated,
    "bg-console": tokens.background.console,
    "modal-backdrop": tokens.background.overlay,
    "surface-default": tokens.surface.default,
    "surface-raised": tokens.surface.raised,
    "surface-hover": tokens.surface.hover,
    "surface-selected": tokens.surface.selected,
    "surface-active": tokens.surface.active,
    "surface-control": tokens.surface.control,
    "surface-table-head": tokens.surface.tableHead,
    "surface-row-hover": tokens.surface.rowHover,
    "text-primary": tokens.text.primary,
    "text-strong": tokens.text.strong,
    "text-secondary": tokens.text.secondary,
    "text-muted": tokens.text.muted,
    "text-disabled": tokens.text.disabled,
    "text-inverse": tokens.text.inverse,
    "border-subtle": tokens.border.subtle,
    "border-default": tokens.border.default,
    "border-strong": tokens.border.strong,
    "telemetry-neutral": tokens.telemetry.neutral,
    "telemetry-selected": tokens.telemetry.selected,
    "telemetry-active": tokens.telemetry.active,
    "telemetry-stale": tokens.telemetry.stale,
    "telemetry-error": tokens.telemetry.error,
    "telemetry-written": tokens.telemetry.written,
    "telemetry-boolean-true": tokens.telemetry.booleanTrue,
    "telemetry-boolean-false": tokens.telemetry.booleanFalse,
    "trend-default": tokens.trend.default,
    "trend-selected": tokens.trend.selected,
    "trend-positive": tokens.trend.positive,
    "trend-negative": tokens.trend.negative,
    "trend-inactive": tokens.trend.inactive,
    "activity-static": tokens.activity.static,
    "activity-low": tokens.activity.low,
    "activity-medium": tokens.activity.medium,
    "activity-high": tokens.activity.high,
    "activity-bursting": tokens.activity.bursting,
    "status-success": tokens.status.success,
    "status-warning": tokens.status.warning,
    "status-error": tokens.status.error,
    "status-info": tokens.status.info,
    "status-pending": tokens.status.pending,
    "action-primary": tokens.action.primary,
    "action-primary-hover": tokens.action.primaryHover,
    "action-primary-muted": tokens.action.primaryMuted,
    "action-focus": tokens.action.focus,
    "action-danger-muted": tokens.action.dangerMuted,
    "chrome-header": tokens.chrome.header,
    "chrome-sidebar": tokens.chrome.sidebar,
    "chrome-toolbar": tokens.chrome.toolbar,
    "scrollbar-track": tokens.chrome.scrollbarTrack,
    "scrollbar-thumb": tokens.chrome.scrollbarThumb,
  };
}
