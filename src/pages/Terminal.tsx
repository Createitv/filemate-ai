import { useEffect, useRef, useState } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import * as api from "@/api";
import { toastError } from "@/components/ui/toast";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface Session {
  id: string;
  el: HTMLDivElement | null;
  term: XTerm;
  fit: FitAddon;
}

export default function Terminal() {
  const [ids, setIds] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const sessionsRef = useRef<Map<string, Session>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  const open = async () => {
    try {
      const id = await api.terminalOpen();
      const term = new XTerm({
        fontFamily: "Menlo, Consolas, 'JetBrains Mono', monospace",
        fontSize: 13,
        theme: { background: "#0b0e14" },
        cursorBlink: true,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.onData((d) => api.terminalWrite(id, d).catch(toastError));
      sessionsRef.current.set(id, { id, el: null, term, fit });
      setIds((prev) => [...prev, id]);
      setActive(id);
    } catch (e) {
      toastError(e);
    }
  };

  const close = async (id: string) => {
    await api.terminalClose(id).catch(() => {});
    const s = sessionsRef.current.get(id);
    s?.term.dispose();
    sessionsRef.current.delete(id);
    setIds((prev) => prev.filter((x) => x !== id));
    if (active === id) {
      const remaining = ids.filter((x) => x !== id);
      setActive(remaining[remaining.length - 1] || null);
    }
  };

  // attach to DOM and listen for output
  useEffect(() => {
    let unlisten: any = null;
    api
      .onTerminalData(({ id, data }) => {
        sessionsRef.current.get(id)?.term.write(data);
      })
      .then((u) => (unlisten = u));
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (!active || !containerRef.current) return;
    const session = sessionsRef.current.get(active);
    if (!session) return;
    if (!session.el) {
      const div = document.createElement("div");
      div.className = "h-full w-full";
      session.el = div;
      session.term.open(div);
    }
    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(session.el!);
    session.fit.fit();
    api.terminalResize(active, session.term.cols, session.term.rows).catch(() => {});
  }, [active, ids]);

  // open one on mount if none
  useEffect(() => {
    if (ids.length === 0) open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <TopBar title="终端" />
      <div className="flex items-center gap-1 px-3 pt-2 border-b border-border/40">
        {ids.map((id, i) => (
          <button
            key={id}
            onClick={() => setActive(id)}
            className={`px-3 py-1.5 text-xs rounded-t-lg border-b-2 flex items-center gap-2 ${
              active === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground"
            }`}
          >
            <span>会话 {i + 1}</span>
            <X
              className="w-3 h-3 hover:text-rose-500"
              onClick={(e) => {
                e.stopPropagation();
                close(id);
              }}
            />
          </button>
        ))}
        <Button variant="ghost" size="icon" onClick={open}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
      <div ref={containerRef} className="flex-1 bg-[#0b0e14]" />
    </div>
  );
}
