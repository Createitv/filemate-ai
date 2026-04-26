// Global QuickLook state. Anywhere in the app you can do:
//   const { open } = useQuickLook();
//   open([{path, name, is_dir}], 0)
// Press Space when an entry is selected to invoke; Esc / click overlay to close.

import { create } from "zustand";

export interface QLItem {
  path: string;
  name: string;
  is_dir?: boolean;
}

interface State {
  visible: boolean;
  items: QLItem[];
  index: number;
  open: (items: QLItem[], index?: number) => void;
  close: () => void;
  next: () => void;
  prev: () => void;
  setIndex: (i: number) => void;
}

export const useQuickLook = create<State>((set, get) => ({
  visible: false,
  items: [],
  index: 0,
  open: (items, index = 0) => set({ items, index, visible: true }),
  close: () => set({ visible: false }),
  next: () => {
    const { items, index } = get();
    if (items.length === 0) return;
    set({ index: (index + 1) % items.length });
  },
  prev: () => {
    const { items, index } = get();
    if (items.length === 0) return;
    set({ index: (index - 1 + items.length) % items.length });
  },
  setIndex: (i) => set({ index: i }),
}));
