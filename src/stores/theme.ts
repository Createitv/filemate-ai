import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "light" | "dark" | "system";

export interface AccentPreset {
  id: string;
  name: string;
  hsl: string; // "H S% L%"
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: "blue",    name: "海洋蓝",   hsl: "220 90% 56%" },
  { id: "indigo",  name: "靛青",     hsl: "239 84% 60%" },
  { id: "violet",  name: "皇家紫",   hsl: "262 83% 58%" },
  { id: "pink",    name: "樱花粉",   hsl: "330 81% 60%" },
  { id: "rose",    name: "玫瑰红",   hsl: "346 77% 55%" },
  { id: "orange",  name: "活力橙",   hsl: "20 90% 55%" },
  { id: "amber",   name: "落日琥珀", hsl: "38 92% 50%" },
  { id: "emerald", name: "翡翠绿",   hsl: "160 84% 39%" },
  { id: "slate",   name: "石墨灰",   hsl: "215 25% 27%" },
];

interface ThemeState {
  mode: ThemeMode;
  accent: string; // preset id or custom HSL
  customAccent?: string;
  setMode: (m: ThemeMode) => void;
  setAccent: (id: string) => void;
  setCustomAccent: (hsl: string) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: "system",
      accent: "blue",
      setMode: (mode) => set({ mode }),
      setAccent: (accent) => set({ accent }),
      setCustomAccent: (customAccent) => set({ customAccent, accent: "custom" }),
    }),
    { name: "filemate.theme" }
  )
);

export function applyTheme(state: ThemeState) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = state.mode === "dark" || (state.mode === "system" && prefersDark);
  root.classList.toggle("dark", dark);

  let hsl = ACCENT_PRESETS[0].hsl;
  if (state.accent === "custom" && state.customAccent) hsl = state.customAccent;
  else {
    const preset = ACCENT_PRESETS.find((p) => p.id === state.accent);
    if (preset) hsl = preset.hsl;
  }
  root.style.setProperty("--primary", hsl);
  root.style.setProperty("--ring", hsl);
  // derive accent surface from primary
  const [h, s] = hsl.split(" ");
  root.style.setProperty("--accent", `${h} ${s} 96%`);
  root.style.setProperty("--accent-foreground", `${h} ${s} 30%`);
}
