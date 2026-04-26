import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./i18n";
import "./index.css";

// Restore persisted language/theme from backend on startup so settings survive
// across reinstalls (browser localStorage is per-installation directory).
import("@/api").then(async (api) => {
  try {
    const lang = await api.getSetting<string>("language");
    if (lang) (await import("./i18n")).default.changeLanguage(lang);
    const mode = await api.getSetting<any>("theme.mode");
    const accent = await api.getSetting<any>("theme.accent");
    if (mode || accent) {
      const { useThemeStore } = await import("@/stores/theme");
      const s = useThemeStore.getState();
      if (mode) s.setMode(mode);
      if (accent) s.setAccent(accent);
    }
  } catch {}
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
