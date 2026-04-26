import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import Home from "@/pages/Home";
import Files from "@/pages/Files";
import Automation from "@/pages/Automation";
import Preview from "@/pages/Preview";
import Settings from "@/pages/Settings";
import Search from "@/pages/Search";
import Tags from "@/pages/Tags";
import Favorites from "@/pages/Favorites";
import Workspaces from "@/pages/Workspaces";
import Cloud from "@/pages/Cloud";
import Terminal from "@/pages/Terminal";
import Encryption from "@/pages/Encryption";
import BatchRename from "@/pages/BatchRename";
import Duplicates from "@/pages/Duplicates";
import VersionHistory from "@/pages/VersionHistory";
import AIProviders from "@/pages/AIProviders";
import Analyze from "@/pages/Analyze";
import { applyTheme, useThemeStore } from "@/stores/theme";
import { ToastViewport } from "@/components/ui/toast";
import { QuickLook } from "@/components/preview/QuickLook";

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
    <>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Home />} />
          <Route path="files" element={<Files />} />
          <Route path="search" element={<Search />} />
          <Route path="favorites" element={<Favorites />} />
          <Route path="workspace" element={<Workspaces />} />
          <Route path="tags" element={<Tags />} />
          <Route path="automation" element={<Automation />} />
          <Route path="preview" element={<Preview />} />
          <Route path="versions" element={<VersionHistory />} />
          <Route path="rename" element={<BatchRename />} />
          <Route path="duplicates" element={<Duplicates />} />
          <Route path="encryption" element={<Encryption />} />
          <Route path="cloud" element={<Cloud />} />
          <Route path="terminal" element={<Terminal />} />
          <Route path="ai-providers" element={<AIProviders />} />
          <Route path="analyze" element={<Analyze />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <QuickLook />
      <ToastViewport />
    </>
  );
}
