// Single global poller for the backend filename index status. Components
// that need it call useIndexStatus() — the interval is reference-counted,
// so it only runs while at least one component is mounted, and adapts its
// rate (fast while indexing, slow while idle) to keep idle wakeups cheap.

import { useEffect } from "react";
import { create } from "zustand";
import * as api from "@/api";
import type { FilenameIndexStatus } from "@/api/types";

interface State {
  status: FilenameIndexStatus | null;
  setStatus: (s: FilenameIndexStatus | null) => void;
}

const store = create<State>((set) => ({
  status: null,
  setStatus: (s) => set({ status: s }),
}));

let timer: ReturnType<typeof setTimeout> | null = null;
let subscribers = 0;

async function tick() {
  try {
    const s = await api.filenameIndexStatus();
    store.getState().setStatus(s);
  } catch {
    // backend may not be ready immediately after launch — retry next tick
  }
  const indexing = store.getState().status?.indexing ?? false;
  const delay = indexing ? 500 : 4000;
  if (subscribers > 0) {
    timer = setTimeout(tick, delay);
  } else {
    timer = null;
  }
}

/** Subscribe to live index status. Stops polling when last subscriber unmounts. */
export function useIndexStatus(): FilenameIndexStatus | null {
  const status = store((s) => s.status);
  useEffect(() => {
    subscribers += 1;
    if (!timer) void tick();
    return () => {
      subscribers = Math.max(0, subscribers - 1);
      if (subscribers === 0 && timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
  }, []);
  return status;
}

/** Read-only access without subscribing — for one-off pokes after a rebuild. */
export const peekIndexStatus = () => store.getState().status;
export const refreshIndexStatus = async () => {
  try {
    const s = await api.filenameIndexStatus();
    store.getState().setStatus(s);
  } catch {}
};
