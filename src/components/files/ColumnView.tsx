// macOS Finder-style multi-column file browser. Each path component on the
// breadcrumb becomes a column showing that directory's contents. Selecting
// a folder appends a new column to the right; selecting a file shows its
// preview / properties in the rightmost column.
//
// Columns scroll horizontally; the active path is auto-scrolled into view.

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import * as api from "@/api";
import type { DirEntryInfo, DirListing, PreviewMeta } from "@/api/types";
import { formatBytes, formatTime } from "@/lib/format";
import { FileIcon } from "@/components/FileIcon";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useQuickLook } from "@/components/preview/useQuickLook";

interface ColumnState {
  path: string;
  listing: DirListing | null;
  loading: boolean;
}

export function ColumnView({
  path,
  onSelectFolder,
  onContextMenu,
}: {
  path: string;
  onSelectFolder: (p: string) => void;
  onContextMenu?: (e: React.MouseEvent, entry: DirEntryInfo) => void;
}) {
  // Build initial column chain from the current path.
  // e.g. "/Users/ling/code" -> ["/", "/Users", "/Users/ling", "/Users/ling/code"]
  const initial = useMemo(() => splitPath(path), [path]);

  const [columns, setColumns] = useState<ColumnState[]>([]);
  const [selected, setSelected] = useState<Record<number, string>>({}); // column index → selected entry path
  const [previewEntry, setPreviewEntry] = useState<DirEntryInfo | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset chain when external `path` changes.
  useEffect(() => {
    if (initial.length === 0) return;
    setColumns(
      initial.map((p) => ({ path: p, listing: null, loading: true }))
    );
    setSelected({});
    setPreviewEntry(null);
    initial.forEach((p, idx) => loadColumn(p, idx));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // Scroll rightmost column into view.
  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [columns.length]);

  const loadColumn = async (p: string, idx: number) => {
    try {
      const listing = await api.listDir(p);
      setColumns((cols) => {
        const next = [...cols];
        if (next[idx]) next[idx] = { path: p, listing, loading: false };
        return next;
      });
    } catch {
      setColumns((cols) => {
        const next = [...cols];
        if (next[idx]) next[idx] = { ...next[idx], loading: false };
        return next;
      });
    }
  };

  const handleClick = (colIdx: number, entry: DirEntryInfo) => {
    setSelected((s) => {
      const next: Record<number, string> = {};
      // keep selections in earlier columns, replace at this column, drop later
      for (let i = 0; i < colIdx; i++) if (s[i]) next[i] = s[i];
      next[colIdx] = entry.path;
      return next;
    });

    if (entry.is_dir) {
      // Append / replace next column, trim everything beyond
      setColumns((cols) => {
        const trimmed = cols.slice(0, colIdx + 1);
        return [...trimmed, { path: entry.path, listing: null, loading: true }];
      });
      loadColumn(entry.path, colIdx + 1);
      setPreviewEntry(null);
    } else {
      setColumns((cols) => cols.slice(0, colIdx + 1));
      setPreviewEntry(entry);
    }
  };

  const handleDoubleClick = (entry: DirEntryInfo) => {
    if (entry.is_dir) {
      onSelectFolder(entry.path);
    } else {
      api.openPath(entry.path).catch(() => {});
    }
  };

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-x-auto overflow-y-hidden flex bg-background scrollbar-thin"
    >
      {columns.map((col, idx) => (
        <FolderColumn
          key={`${idx}-${col.path}`}
          col={col}
          selectedPath={selected[idx]}
          onPick={(entry) => handleClick(idx, entry)}
          onDouble={handleDoubleClick}
          onContextMenu={onContextMenu}
          isLast={idx === columns.length - 1 && !previewEntry}
        />
      ))}
      {previewEntry && <PreviewColumn entry={previewEntry} />}
    </div>
  );
}

function FolderColumn({
  col,
  selectedPath,
  onPick,
  onDouble,
  onContextMenu,
  isLast,
}: {
  col: ColumnState;
  selectedPath?: string;
  onPick: (entry: DirEntryInfo) => void;
  onDouble: (entry: DirEntryInfo) => void;
  onContextMenu?: (e: React.MouseEvent, entry: DirEntryInfo) => void;
  isLast: boolean;
}) {
  return (
    <div
      className={cn(
        "h-full w-[260px] shrink-0 border-r border-border/60 overflow-y-auto scrollbar-thin",
        isLast && "min-w-[260px]"
      )}
    >
      {col.loading && (
        <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
          加载…
        </div>
      )}
      {col.listing && col.listing.entries.length === 0 && (
        <div className="text-center py-6 text-xs text-muted-foreground">空目录</div>
      )}
      {col.listing?.entries.map((entry) => {
        const active = selectedPath === entry.path;
        return (
          <button
            key={entry.path}
            onClick={() => onPick(entry)}
            onDoubleClick={() => onDouble(entry)}
            onContextMenu={(e) => onContextMenu?.(e, entry)}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors text-left",
              active
                ? "bg-primary text-primary-foreground"
                : "hover:bg-accent/40"
            )}
          >
            <FileIcon entry={entry} size="sm" thumbnail />
            <span className="truncate flex-1">{entry.name}</span>
            {entry.is_dir && entry.is_empty && (
              <span
                className={cn(
                  "text-[9px] px-1 rounded shrink-0",
                  active
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-secondary text-muted-foreground"
                )}
              >
                空
              </span>
            )}
            {entry.is_dir && (
              <ChevronRight
                className={cn(
                  "w-3 h-3 shrink-0",
                  active ? "text-primary-foreground/80" : "text-muted-foreground"
                )}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

function PreviewColumn({ entry }: { entry: DirEntryInfo }) {
  const { open } = useQuickLook();
  const [meta, setMeta] = useState<PreviewMeta | null>(null);

  useEffect(() => {
    setMeta(null);
    api.previewFile(entry.path).then(setMeta).catch(() => {});
  }, [entry.path]);

  const isImage = meta?.kind === "image" || entry.extension === "svg";
  const isVideo = meta?.kind === "video";

  return (
    <div className="h-full w-[320px] shrink-0 overflow-y-auto scrollbar-thin">
      <div className="p-4 space-y-3">
        <div className="aspect-square rounded-xl bg-card border border-border/60 overflow-hidden flex items-center justify-center">
          {isImage ? (
            <img
              src={convertFileSrc(entry.path)}
              alt=""
              className="max-w-full max-h-full object-contain"
            />
          ) : isVideo ? (
            <video
              src={convertFileSrc(entry.path)}
              muted
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-2">
              <span className="text-3xl font-bold text-muted-foreground/40">
                .{entry.extension || "file"}
              </span>
            </div>
          )}
        </div>

        <div>
          <div className="text-sm font-medium break-all">{entry.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {formatBytes(entry.size)}
            {entry.modified && ` · ${formatTime(entry.modified)}`}
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <Row k="类型" v={meta?.kind || "—"} />
          <Row k="MIME" v={meta?.mime || "—"} />
          {meta?.extras?.kind === "image" && (
            <>
              <Row k="尺寸" v={`${meta.extras.width} × ${meta.extras.height}`} />
              <Row k="色彩" v={meta.extras.color} />
            </>
          )}
          {meta?.extras?.kind === "audio" && (
            <>
              <Row k="时长" v={`${Math.round(meta.extras.duration_ms / 1000)} 秒`} />
              {meta.extras.bitrate && <Row k="比特率" v={`${meta.extras.bitrate} kbps`} />}
              {meta.extras.artist && <Row k="艺术家" v={meta.extras.artist} />}
            </>
          )}
        </div>

        <button
          onClick={() => open([{ path: entry.path, name: entry.name }], 0)}
          className="w-full px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90"
        >
          空格预览
        </button>
        <button
          onClick={() => api.openPath(entry.path).catch(() => {})}
          className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm hover:bg-accent/40"
        >
          用默认程序打开
        </button>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/40 last:border-0 text-xs">
      <span className="text-muted-foreground w-12 shrink-0">{k}</span>
      <span className="flex-1 truncate font-mono">{v}</span>
    </div>
  );
}

function splitPath(p: string): string[] {
  if (!p) return [];
  // Determine separator: posix '/' or windows '\\'
  const isWindows = /^[A-Za-z]:[\\/]/.test(p);
  if (isWindows) {
    const drive = p.slice(0, 3); // "C:\"
    const rest = p.slice(3).split(/[\\/]/).filter(Boolean);
    const out: string[] = [drive];
    let acc = drive;
    for (const part of rest) {
      acc = acc.endsWith("\\") || acc.endsWith("/") ? `${acc}${part}` : `${acc}\\${part}`;
      out.push(acc);
    }
    return out;
  }
  // POSIX
  const parts = p.split("/").filter(Boolean);
  const out: string[] = ["/"];
  let acc = "";
  for (const part of parts) {
    acc = `${acc}/${part}`;
    out.push(acc);
  }
  return out;
}
