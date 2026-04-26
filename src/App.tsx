import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import Home from "@/pages/Home";
import Files from "@/pages/Files";
import Automation from "@/pages/Automation";
import Preview from "@/pages/Preview";
import Settings from "@/pages/Settings";
import { applyTheme, useThemeStore } from "@/stores/theme";

export default function App() {
  const theme = useThemeStore();

  useEffect(() => {
    applyTheme(theme);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(useThemeStore.getState());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme.mode, theme.accent, theme.customAccent, theme]);

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Home />} />
        <Route path="files" element={<Files />} />
        <Route path="automation" element={<Automation />} />
        <Route path="preview" element={<Preview />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
