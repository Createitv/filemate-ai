// Layout-level UI preferences (sidebar / AI panel collapse state). Persisted
// to localStorage so the user's choice survives reloads. The collapsed
// sidebar still shows all icons; the AI panel shrinks to a thin chevron
// strip that the user clicks to bring it back.

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface LayoutState {
  sidebarCollapsed: boolean;
  aiPanelCollapsed: boolean;
  toggleSidebar: () => void;
  toggleAiPanel: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  setAiPanelCollapsed: (v: boolean) => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      aiPanelCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      toggleAiPanel: () => set((s) => ({ aiPanelCollapsed: !s.aiPanelCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setAiPanelCollapsed: (aiPanelCollapsed) => set({ aiPanelCollapsed }),
    }),
    { name: "filemate.layout" }
  )
);
