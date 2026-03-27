const palette = {
  background: "#05060d",
  surface: "#0b1224",
  elevated: "#111a32",
  accent: "#ffb347",
  accentSecondary: "#7dd3fc",
  accentTertiary: "#e879f9",
  textPrimary: "#f7f7f8",
  textMuted: "rgba(247,247,248,0.75)",
  success: "#34d399",
  danger: "#f87171",
};

export default {
  palette,
  light: {
    text: palette.textPrimary,
    background: palette.background,
    tint: palette.accent,
    tabIconDefault: palette.textMuted,
    tabIconSelected: palette.accent,
  },
};
