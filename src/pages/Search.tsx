// Everything-style instant filename search backed by an in-memory index.
// On first visit we build an index over $HOME (skipping noise dirs); after
// that, each keystroke filters the index in a few ms. The notify watcher
// keeps the index live, so a full rebuild is only needed when scope changes.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Search as SearchIcon,
  Loader2,
  FolderOpen,
  X,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import * as api from "@/api";
import type { IndexedEntry } from "@/api/types";
import { formatBytes, formatTime } from "@/lib/format";
import { toastError } from "@/components/ui/toast";
import { FileIcon } from "@/components/FileIcon";
import { cn } from "@/lib/utils";
import { useIndexStatus, refreshIndexStatus } from "@/stores/indexStatus";

export default function Search() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialQ = searchParams.get("q") || "";

  const [q, setQ] = useState(initialQ);
  const [hits, setHits] = useState<IndexedEntry[]>([]);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [active, setActive] = useState<string | null>(null);
  // Status comes from the global store — already polled by TopBar, so the
  // Search page just observes. No auto-build trigger here: the backend
  // starts a scan on app launch.
  const status = useIndexStatus();

  // Synchronous-ish query: index is in-memory, no debounce needed.
  const reqIdRef = useRef(0);
  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setHits([]);
      setElapsed(null);
      return;
    }
    if (status?.count === 0 || status?.indexing) return;

    const id = ++reqIdRef.current;
    const t0 = performance.now();
    api
      .queryFilenameIndex(query, 500)
      .then((r) => {
        if (id !== reqIdRef.current) return;
        setHits(r);
        setElapsed(performance.now() - t0);
      })
      .catch((e) => {
        if (id === reqIdRef.current) toastError(e);
      });
  }, [q, status?.count, status?.indexing]);

  const ensureIndex = async (root: string) => {
    try {
      await api.buildFilenameIndex(root);
      await refreshIndexStatus();
    } catch (e) {
      toastError(e);
      await refreshIndexStatus();
    }
  };

  const pickScope = async () => {
    const dir = await openDialog({ directory: true, multiple: false });
    if (dir) ensureIndex(String(dir));
  };

  const rebuild = () => {
    if (status?.root) ensureIndex(status.root);
  };

  const revealInFiles = (entry: IndexedEntry) => {
    const parent = entry.is_dir
      ? entry.path
      : entry.path.replace(/[\\/][^\\/]*$/, "") || entry.path;
    navigate(`/files?path=${encodeURIComponent(parent)}`);
  };

  const openEntry = (entry: IndexedEntry) => {
    if (entry.is_dir) {
      navigate(`/files?path=${encodeURIComponent(entry.path)}`);
    } else {
      api.openPath(entry.path).catch(toastError);
    }
  };

  const scopeLabel = useMemo(() => {
    const r = status?.root;
    if (!r) return "—";
    const parts = r.split(/[\\/]/).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : r;
  }, [status?.root]);

  const indexing = status?.indexing ?? false;
  const indexed = status?.count ?? 0;

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
                placeholder={
                  indexing
                    ? `正在建立索引… 已扫描 ${status?.progress.toLocaleString()} 项`
                    : "按文件名搜索…（即时查询）"
                }
                value={q}
                onChange={(e) => setQ(e.target.value)}
                disabled={indexing && indexed === 0}
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
            <Button variant="outline" onClick={pickScope} disabled={indexing}>
              <FolderOpen className="w-4 h-4" />
              范围: {scopeLabel}
            </Button>
            <Button
              variant="outline"
              onClick={rebuild}
              disabled={indexing || !status?.root}
              title="重建索引"
            >
              {indexing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </Button>
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground h-4">
            {indexing && (
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                建立索引中… {status?.progress.toLocaleString()} 项
              </span>
            )}
            {!indexing && indexed > 0 && q && (
              <span>
                {hits.length} / {indexed.toLocaleString()} 条
                {elapsed !== null && ` · ${Math.max(1, Math.round(elapsed))} ms`}
              </span>
            )}
            {!indexing && indexed > 0 && !q && (
              <span>已索引 {indexed.toLocaleString()} 项 · 输入即查</span>
            )}
            {!indexing && indexed === 0 && (
              <span>索引为空，点击右上角刷新按钮或选择范围后重新建立。</span>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-6 pb-6">
          {q && hits.length === 0 && !indexing && indexed > 0 && (
            <div className="text-center text-sm text-muted-foreground py-16">
              未找到匹配项
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
                const entryShape = {
                  ...h,
                  is_symlink: false,
                  extension: h.name.includes(".")
                    ? h.name.split(".").pop()
                    : undefined,
                };
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
                      <FileIcon entry={entryShape as any} size="sm" />
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
