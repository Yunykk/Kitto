export const themes = [
  { id: "orbit", name: "Orbit" },
  { id: "soft-ceramic", name: "Soft Ceramic" },
  { id: "editorial", name: "Editorial" },
  { id: "tape-deck", name: "Tape Deck" },
  { id: "floating-bento", name: "Floating Bento" },
  { id: "paper-club", name: "Paper Club" },
] as const;

export type ThemeId = (typeof themes)[number]["id"];
export type ColorMode = "light" | "dark";
export type AppearanceSettings = { theme: ThemeId; mode: ColorMode; accent: string };

export const APPEARANCE_KEY = "kitto.appearance.v1";
export const defaultAppearance: AppearanceSettings = {
  theme: "orbit",
  mode: "light",
  accent: "#ff6a1a",
};

export const accentPresets = [
  { name: "Tangerine", color: "#ff6a1a" },
  { name: "Rose", color: "#e74779" },
  { name: "Violet", color: "#9164e8" },
  { name: "Blue", color: "#397ce6" },
  { name: "Teal", color: "#168b86" },
  { name: "Moss", color: "#6e913b" },
  { name: "Honey", color: "#dda52b" },
  { name: "Graphite", color: "#737783" },
] as const;

export function isThemeId(value: unknown): value is ThemeId {
  return themes.some((theme) => theme.id === value);
}

export function normalizeHex(value: string): string | null {
  const hex = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
  if (/^#[0-9a-f]{3}$/.test(hex)) {
    return `#${[...hex.slice(1)].map((digit) => digit + digit).join("")}`;
  }
  return null;
}

export function parseAppearance(value: unknown): AppearanceSettings {
  if (
    typeof value !== "object" || value === null || Array.isArray(value) ||
    !("version" in value) || value.version !== 1
  ) return { ...defaultAppearance };

  return {
    theme: "theme" in value && isThemeId(value.theme) ? value.theme : defaultAppearance.theme,
    mode: "mode" in value && (value.mode === "light" || value.mode === "dark")
      ? value.mode : defaultAppearance.mode,
    accent: "accent" in value && typeof value.accent === "string"
      ? normalizeHex(value.accent) ?? defaultAppearance.accent : defaultAppearance.accent,
  };
}

function channels(hex: string): number[] {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

function luminance(hex: string): number {
  const linear = channels(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

export function contrastRatio(first: string, second: string): number {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function accentColors(accent: string, mode: ColorMode) {
  const color = normalizeHex(accent) ?? defaultAppearance.accent;
  const background = mode === "dark" ? "#202124" : "#f0ece3";
  const target = mode === "dark" ? 255 : 0;
  let ink = color;

  for (let amount = 0.05; contrastRatio(ink, background) < 5 && amount <= 1.01; amount += 0.05) {
    ink = `#${channels(color).map((channel) =>
      Math.round(channel + (target - channel) * Math.min(1, amount))
        .toString(16).padStart(2, "0"),
    ).join("")}`;
  }

  return {
    accent: color,
    ink,
    onAccent: contrastRatio(color, "#ffffff") > contrastRatio(color, "#000000")
      ? "#ffffff" : "#000000",
  };
}
