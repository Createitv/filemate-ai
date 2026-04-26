// Everything-style instant filename search. The user types, results stream
// in under ~150ms debounce. AI / natural-language search lives in the AI
// panel; this page is purely "type a name, find a file".

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import {
  Search as SearchIcon,
  Loader2,
  FolderOpen,
  X,
  ArrowRight,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import * as api from "@/api";
import type { DirEntryInfo } from "@/api/types";
import { formatBytes, formatTime } from "@/lib/format";
import { toastError } from "@/components/ui/toast";
import { FileIcon } from "@/components/FileIcon";
import { cn } from "@/lib/utils";

export default function Search() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialQ = searchParams.get("q") || "";

  const [q, setQ] = useState(initialQ);
  const [scope, setScope] = useState<string>("");
  const [hits, setHits] = useState<DirEntryInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [active, setActive] = useState<string | null>(null);

  // Pick up home dir on mount as default scope.
  useEffect(() => {
    api.homeDir().then(setScope).catch(() => {});
  }, []);

  // Debounced search — also cancellable via reqId so stale results don't win.
  const reqIdRef = useRef(0);
  useEffect(() => {
    if (!scope) return;
    const query = q.trim();
    if (!query) {
      setHits([]);
      setElapsed(null);
      setBusy(false);
      return;
    }
    const handle = setTimeout(async () => {
      const id = ++reqIdRef.current;
      setBusy(true);
      const t0 = performance.now();
      try {
        const results = await api.searchFilenames(scope, query, 500);
        if (id !== reqIdRef.current) return; // a newer query already fired
        setHits(results);
        setElapsed(performance.now() - t0);
      } catch (e) {
        if (id === reqIdRef.current) toastError(e);
      } finally {
        if (id === reqIdRef.current) setBusy(false);
      }
    }, 150);
    return () => clearTimeout(handle);
  }, [q, scope]);

  const pickScope = async () => {
    const dir = await openDialog({ directory: true, multiple: false });
    if (dir) setScope(String(dir));
  };

  const revealInFiles = (entry: DirEntryInfo) => {
    // Navigate Files page to the parent folder so the file is visible.
    const parent = entry.is_dir
      ? entry.path
      : entry.path.replace(/[\\/][^\\/]*$/, "") || entry.path;
    navigate(`/files?path=${encodeURIComponent(parent)}`);
  };

  const openEntry = (entry: DirEntryInfo) => {
    if (entry.is_dir) {
      navigate(`/files?path=${encodeURIComponent(entry.path)}`);
    } else {
      api.openPath(entry.path).catch(toastError);
    }
  };

  const scopeLabel = useMemo(() => {
    if (!scope) return "—";
    const parts = scope.split(/[\\/]/).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : scope;
  }, [scope]);

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <TopBar title="搜索" />
      <div className="flex-1 flex flex-col min-h-0">
        {/* Search bar */}
        <div className="px-6 pt-6 pb-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                autoFocus
                className="pl-9 pr-9 h-11"
                placeholder="按文件名搜索…（无需回车，输入即查）"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              {q && (
                <button
                  onClick={() => setQ("")}
                  title="清除"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <Button variant="outline" onClick={pickScope}>
              <FolderOpen className="w-4 h-4" />
              范围: {scopeLabel}
            </Button>
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground h-4">
            {busy && (
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> 搜索中…
              </span>
            )}
            {!busy && q && (
              <span>
                {hits.length} 条结果
                {elapsed !== null && ` · ${Math.round(elapsed)} ms`}
              </span>
            )}
            {!q && (
              <span>提示：自然语言搜索请在右侧 AI 面板中使用。</span>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-6 pb-6">
          {q && hits.length === 0 && !busy && (
            <div className="text-center text-sm text-muted-foreground py-16">
              未找到匹配项
            </div>
          )}
          {!q && hits.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-16">
              输入文件名即可开始搜索。
            </div>
          )}

          {hits.length > 0 && (
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_90px_140px_44px] items-center gap-3 px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground bg-secondary/40 border-b border-border/60">
                <span>名称</span>
                <span>路径</span>
                <span className="text-right">大小</span>
                <span>修改时间</span>
                <span />
              </div>
              {hits.map((h) => {
                const isActive = active === h.path;
                return (
                  <div
                    key={h.path}
                    onClick={() => setActive(h.path)}
                    onDoubleClick={() => openEntry(h)}
                    className={cn(
                      "grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_90px_140px_44px] items-center gap-3 px-3 py-2 text-sm cursor-pointer border-b border-border/40 last:border-b-0",
                      isActive ? "bg-accent/60" : "hover:bg-accent/30"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileIcon entry={h} size="sm" />
                      <span className="truncate">{h.name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {h.path}
                    </div>
                    <div className="text-xs text-muted-foreground text-right tabular-nums">
                      {h.is_dir ? "—" : formatBytes(h.size)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatTime(h.modified)}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        revealInFiles(h);
                      }}
                      title="在文件管理中定位"
                      className="w-8 h-8 rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground flex items-center justify-center"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
