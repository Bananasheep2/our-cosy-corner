"use client";
import { useState, type CSSProperties } from "react";

// The signature interactive element, now a fuller "make it yours"
// configurator: seven real app theme presets, an accent-colour override, and
// a corner-radius toggle, all driving one live mockup of the actual UI
// (sidebar page tree, a page title, a couple of blocks).
//
// Contrast policy (full audit in the report): the mockup's ink text always
// sits at full-opacity --t-ink against bg/panel/panel2, which clears 7:1+ in
// all seven themes including Velvet Night, where ink/accent invert against a
// dark page — this pairing never changes with the accent override, so it
// stays exactly as contrast-verified as the original design.
//
// The one pairing that *does* change with the accent override is
// text/icon-on-solid-accent (the little check mark, the home-icon mark).
// Rather than eyeball it, onAccent is computed at render time from the
// active accent's own luminance (see pickOnAccent below) — the worst case
// across every accent this page can produce is 4.19:1 (Velvet Night's own
// lavender against its darker candidate), comfortably past the 3:1 floor
// WCAG sets for graphical/UI objects, and past 4.5:1 in every other case.
// The soft accent-tint used behind the active-page row is deliberately left
// tied to each theme's own pre-verified tone rather than recomputed from the
// override, so that pairing never regresses either.
//
// The mock body is `aria-hidden` — decorative, not the accessible surface.
// The three control groups below (real <button>s, aria-pressed, visible
// focus) are what a keyboard or screen-reader user actually operates.

type Theme = {
  name: string;
  bg: string;
  panel: string;
  panel2: string;
  ink: string;
  inkSoft: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  line: string;
};

const THEMES: Theme[] = [
  { name: "Parchment", bg: "#edede9", panel: "#faf6f2", panel2: "#f5ebe0", ink: "#2e2823", inkSoft: "#5f5044", accent: "#7b4b33", accentSoft: "#d5bdaf", onAccent: "#fdf6f0", line: "#d5bdaf" },
  { name: "Peach Blossom", bg: "#f8edeb", panel: "#fffaf9", panel2: "#f9dcc4", ink: "#4a2b26", inkSoft: "#8a5f56", accent: "#b8543f", accentSoft: "#ffb5a7", onAccent: "#fffaf9", line: "#f0dcd6" },
  { name: "Cherry Blossom", bg: "#ffe5ec", panel: "#fff6f9", panel2: "#ffe2ea", ink: "#56263a", inkSoft: "#8f5168", accent: "#c23a5e", accentSoft: "#ffb3c6", onAccent: "#ffffff", line: "#f7c9d6" },
  { name: "Evergreen", bg: "#cad2c5", panel: "#eef1ea", panel2: "#dee5d9", ink: "#2f3e46", inkSoft: "#3f5a58", accent: "#52796f", accentSoft: "#84a98c", onAccent: "#ffffff", line: "#b0bcab" },
  { name: "Frosted Petal", bg: "#eff7f6", panel: "#fbfdfd", panel2: "#fbeef3", ink: "#1f4e4a", inkSoft: "#5b837e", accent: "#c74277", accentSoft: "#f2b5d4", onAccent: "#ffffff", line: "#d5e8e5" },
  { name: "Clear Harbour", bg: "#e6f3fc", panel: "#f7fbff", panel2: "#e4f1fa", ink: "#1b4965", inkSoft: "#52768e", accent: "#1b4965", accentSoft: "#bee9e8", onAccent: "#f2f9ff", line: "#c9dfec" },
  { name: "Velvet Night", bg: "#11001c", panel: "#3d0136", panel2: "#4f0147", ink: "#f2e7fb", inkSoft: "#c3a8d8", accent: "#a35de0", accentSoft: "#3a015c", onAccent: "#1c0129", line: "#43155c" },
];

// Accent overrides — every one of these hexes already exists in the app's
// own theme palettes above (nothing invented), named after the theme each
// belongs to by default so the accessible label makes sense on its own.
const ACCENTS: { hex: string; label: string }[] = [
  { hex: "#7b4b33", label: "Sienna" },
  { hex: "#b8543f", label: "Clay" },
  { hex: "#c23a5e", label: "Cherry" },
  { hex: "#52796f", label: "Evergreen" },
  { hex: "#1b4965", label: "Harbour" },
  { hex: "#a35de0", label: "Velvet" },
];

type RadiusKey = "soft" | "rounded" | "sharp";
const RADII: Record<RadiusKey, { label: string; card: number; control: number; tiny: number }> = {
  soft: { label: "Soft", card: 18, control: 10, tiny: 6 },
  rounded: { label: "Rounded", card: 10, control: 7, tiny: 5 },
  sharp: { label: "Sharp", card: 3, control: 3, tiny: 3 },
};
const RADIUS_ORDER: RadiusKey[] = ["soft", "rounded", "sharp"];

// -- WCAG contrast: relative luminance + ratio, used to pick a legible
// onAccent (text/icon colour) for whatever accent is currently active,
// instead of hand-picking one per combination. --
function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function srgbToLin(c: number) {
  const cs = c / 255;
  return cs <= 0.04045 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}
function relLuminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
}
function contrastRatio(hex1: string, hex2: string) {
  const l1 = relLuminance(hex1);
  const l2 = relLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
function pickOnAccent(accentHex: string) {
  const light = "#fffaf9";
  const dark = "#241a1c";
  return contrastRatio(accentHex, light) >= contrastRatio(accentHex, dark) ? light : dark;
}

function HomeIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 11l8-6 8 6" />
      <path d="M6 10v9h12v-9" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12l4.5 4.5L19 7" />
    </svg>
  );
}

export default function ThemeSwitcher() {
  const [themeIndex, setThemeIndex] = useState(0);
  const [accentOverride, setAccentOverride] = useState<string | null>(null);
  const [radiusKey, setRadiusKey] = useState<RadiusKey>("soft");

  const theme = THEMES[themeIndex];
  const activeAccent = accentOverride ?? theme.accent;
  const onAccent = pickOnAccent(activeAccent);
  const radii = RADII[radiusKey];

  function selectTheme(i: number) {
    setThemeIndex(i);
    setAccentOverride(null); // a fresh preset starts from its own default accent
  }

  const vars = {
    "--t-bg": theme.bg,
    "--t-panel": theme.panel,
    "--t-panel2": theme.panel2,
    "--t-ink": theme.ink,
    "--t-ink-soft": theme.inkSoft,
    "--t-accent": activeAccent,
    "--t-accent-soft": theme.accentSoft,
    "--t-on-accent": onAccent,
    "--t-line": theme.line,
    "--t-radius-card": `${radii.card}px`,
    "--t-radius-control": `${radii.control}px`,
    "--t-radius-tiny": `${radii.tiny}px`,
  } as CSSProperties;

  return (
    <div className="peek">
      <div className="peek-controls rv rv-left">
        <div className="peek-control-group">
          <div className="peek-control-label">Theme</div>
          <div className="peek-swatches" role="group" aria-label="Preview a theme">
            {THEMES.map((t, i) => (
              <button
                key={t.name}
                type="button"
                className="swatch"
                style={{ "--swatch-bg": t.bg, "--swatch-accent": t.accent } as CSSProperties}
                aria-pressed={i === themeIndex}
                aria-label={`Preview the ${t.name} theme`}
                onClick={() => selectTheme(i)}
              >
                <span className="swatch-chip" aria-hidden="true" />
                <span className="swatch-name">{t.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="peek-control-group">
          <div className="peek-control-label">Accent colour</div>
          <div className="peek-accents" role="group" aria-label="Accent colour">
            {ACCENTS.map((a) => (
              <button
                key={a.hex}
                type="button"
                className="accent-swatch"
                style={{ background: a.hex } as CSSProperties}
                aria-pressed={activeAccent === a.hex}
                aria-label={`Use the ${a.label} accent`}
                onClick={() => setAccentOverride(a.hex)}
              />
            ))}
          </div>
        </div>

        <div className="peek-control-group">
          <div className="peek-control-label">Corner radius</div>
          <div className="peek-radii" role="group" aria-label="Corner radius">
            {RADIUS_ORDER.map((key) => (
              <button
                key={key}
                type="button"
                className="radius-btn"
                aria-pressed={radiusKey === key}
                onClick={() => setRadiusKey(key)}
              >
                {RADII[key].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="peek-mock-wrap rv rv-right">
        <div className="peek-mock" style={vars}>
          <div className="peek-head">
            <span className="peek-mark"><HomeIcon /></span>
            <span className="peek-brand">Our Cosy Corner</span>
            <span className="peek-code">CODE FCY7GC</span>
          </div>
          <div className="peek-body" aria-hidden="true">
            <nav className="peek-tree">
              <div className="peek-tree-label"><HomeIcon /> Our Corner</div>
              <div className="peek-page peek-page-active">Our shared plans</div>
              <div className="peek-page">Maya&rsquo;s side</div>
              <div className="peek-page">Their side</div>
              <div className="peek-newpage"><PlusIcon /> New page</div>
            </nav>
            <div className="peek-page-body">
              <div className="peek-title">Our shared plans</div>
              <div className="peek-block peek-block-done">
                <span className="peek-check"><CheckIcon /></span>
                Move in day
              </div>
              <div className="peek-block">
                <span className="peek-check peek-check-empty" />
                Pick paint colours
              </div>
              <div className="peek-chip"><PlusIcon /> add block</div>
            </div>
          </div>
        </div>
        <p className="peek-name">this is <strong>{theme.name}</strong>.</p>
      </div>
    </div>
  );
}
