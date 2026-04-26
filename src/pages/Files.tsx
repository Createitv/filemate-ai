import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Folder,
  FileText,
  FileImage,
  FileVideo,
  FileArchive,
  FileAudio,
  ChevronRight,
  ChevronLeft,
  LayoutGrid,
  List,
  Plus,
  Upload,
  Eye,
  Copy,
  Scissors,
  ClipboardPaste,
  Pencil,
  Trash2,
  Tag,
  History,
  Sparkles,
  Settings as SettingsIcon,
  ExternalLink,
  FolderOpen as FolderOpenIcon,
  Loader2,
  Home as HomeIcon,
  ArrowUp,
  RefreshCw,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { AIPanel } from "@/components/layout/AIPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fileIconColor, formatBytes, formatTime } from "@/lib/format";
import * as api from "@/api";
import type { DirEntryInfo, DirListing } from "@/api/types";
import { toast, toastError } from "@/components/ui/toast";
import { useQuickLook } from "@/components/preview/useQuickLook";
import { OpenWithDialog } from "@/components/OpenWithMenu";

interface Clipboard {
  paths: string[];
  mode: "copy" | "cut";
}

export default function Files() {
  const { t } = useTranslation();
  const [path, setPath] = useState<string>("");
  const [listing, setListing] = useState<DirListing | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [view, setView] = useState<"list" | "grid">("list");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ctx, setCtx] = useState<{ x: number; y: number; target: DirEntryInfo } | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [clipboard, setClipboard] = useState<Clipboard | null>(null);
  const [openWithFor, setOpenWithFor] = useState<string | null>(null);

  const navigate = useCallback(async (target: string, recordHistory = true) => {
    setLoading(true);
    try {
      const result = await api.listDir(target);
      setListing(result);
      setPath(result.path);
      setSelected(new Set());
      if (recordHistory) {
        setHistory((h) => [...h.slice(0, historyIdx + 1), result.path]);
        setHistoryIdx((i) => i + 1);
      }
      await api.watchDir(result.path).catch(() => {});
    } catch (e) {
      toastError(e);
    } finally {
      setLoading(false);
    }
  }, [historyIdx]);

  const [searchParams] = useSearchParams();
  const queryPath = searchParams.get("path");

  // initial load + react to ?path= changes
  useEffect(() => {
    if (queryPath) {
      navigate(queryPath);
    } else if (!path) {
      api.homeDir().then((p) => navigate(p)).catch(toastError);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryPath]);

  useEffect(() => {
    let unlisten: any = null;
    api.onFsEvent(() => {
      // simple refresh on any event in current dir
      if (path) api.listDir(path).then(setListing).catch(() => {});
    }).then((u) => (unlisten = u));
    return () => {
      if (unlisten) unlisten();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // close ctx menu
  useEffect(() => {
    const close = () => setCtx(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  // Space → QuickLook on the currently selected (or first selected) file
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key !== " ") return;
      if (!listing) return;
      const ql = useQuickLook.getState();
      if (ql.visible) return; // QuickLook handles its own space-to-close
      e.preventDefault();
      const visibleEntries = listing.entries;
      const selectedFiles = visibleEntries.filter(
        (x) => selected.has(x.path) && !x.is_dir
      );
      const items =
        selectedFiles.length > 0
          ? selectedFiles
          : visibleEntries.filter((x) => !x.is_dir);
      if (items.length === 0) return;
      const startIdx =
        selectedFiles.length > 0
          ? items.findIndex((x) => x.path === selectedFiles[0].path)
          : 0;
      ql.open(
        items.map((x) => ({ path: x.path, name: x.name, is_dir: x.is_dir })),
        Math.max(0, startIdx)
      );
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [listing, selected]);

  const goUp = () => {
    if (listing?.parent) navigate(listing.parent);
  };
  const goBack = () => {
    if (historyIdx > 0) {
      setHistoryIdx((i) => i - 1);
      navigate(history[historyIdx - 1], false);
    }
  };
  const goFwd = () => {
    if (historyIdx < history.length - 1) {
      setHistoryIdx((i) => i + 1);
      navigate(history[historyIdx + 1], false);
    }
  };

  const onActivate = async (entry: DirEntryInfo) => {
    if (entry.is_dir) {
      await navigate(entry.path);
    } else {
      await api.openPath(entry.path).catch(toastError);
      await api.touchRecent(entry.path, entry.name, entry.is_dir).catch(() => {});
    }
  };

  const onContextMenu = (e: React.MouseEvent, entry: DirEntryInfo) => {
    e.preventDefault();
    setSelected((prev) => {
      const next = new Set(prev);
      next.add(entry.path);
      return next;
    });
    setCtx({ x: e.clientX, y: e.clientY, target: entry });
  };

  const onSelect = (e: React.MouseEvent, entry: DirEntryInfo) => {
    setSelected((prev) => {
      const next = new Set(e.metaKey || e.ctrlKey ? prev : []);
      if (next.has(entry.path)) next.delete(entry.path);
      else next.add(entry.path);
      return next;
    });
  };

  const filtered = useMemo(() => {
    if (!listing) return [] as DirEntryInfo[];
    const f = filter.trim().toLowerCase();
    if (!f) return listing.entries;
    return listing.entries.filter((e) => e.name.toLowerCase().includes(f));
  }, [listing, filter]);

  // ctx actions
  const doCopy = (mode: "copy" | "cut") => {
    const paths = selected.size > 0 ? Array.from(selected) : ctx ? [ctx.target.path] : [];
    if (!paths.length) return;
    setClipboard({ paths, mode });
    toast(`${mode === "copy" ? "已复制" : "已剪切"} ${paths.length} 项`, "success");
  };

  const doPaste = async () => {
    if (!clipboard || !path) return;
    try {
      for (const src of clipboard.paths) {
        const name = src.split(/[\\/]/).pop() || "untitled";
        const dst = `${path.replace(/[\\/]+$/, "")}/${name}`;
        if (clipboard.mode === "copy") {
          await api.copyEntry(src, dst, false);
        } else {
          await api.moveEntry(src, dst);
        }
      }
      toast("已粘贴", "success");
      if (clipboard.mode === "cut") setClipboard(null);
      navigate(path, false);
    } catch (e) {
      toastError(e);
    }
  };

  const doDelete = async () => {
    const paths = selected.size > 0 ? Array.from(selected) : ctx ? [ctx.target.path] : [];
    if (!paths.length) return;
    try {
      await api.deleteToTrash(paths);
      toast(`已移至回收站 ${paths.length} 项`, "success");
      navigate(path, false);
    } catch (e) {
      toastError(e);
    }
  };

  const doRename = async () => {
    if (!ctx) return;
    const target = ctx.target;
    const newName = prompt("重命名为", target.name);
    if (!newName || newName === target.name) return;
    const dir = target.path.replace(/[\\/][^\\/]+$/, "");
    try {
      await api.renameEntry(target.path, `${dir}/${newName}`);
      navigate(path, false);
    } catch (e) {
      toastError(e);
    }
  };

  const doNewFolder = async () => {
    const name = prompt("新建文件夹名");
    if (!name) return;
    try {
      await api.createFolder(path, name);
      navigate(path, false);
    } catch (e) {
      toastError(e);
    }
  };

  const doVersion = async () => {
    if (!ctx) return;
    try {
      await api.createVersion(ctx.target.path);
      toast("已创建版本快照", "success");
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <div className="flex-1 flex min-w-0">
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar title={t("files.title")} />

        <div className="px-4 py-2 border-b border-border/60 flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={goBack} disabled={historyIdx <= 0}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={goFwd} disabled={historyIdx >= history.length - 1}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={goUp} disabled={!listing?.parent}>
            <ArrowUp className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => navigate(path, false)}>
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </Button>
          <Breadcrumbs path={path} onJump={(p) => navigate(p)} />

          <Input
            className="w-56"
            placeholder={t("files.path_placeholder")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />

          <div className="flex items-center gap-1 bg-secondary/60 rounded-lg p-1">
            <button
              onClick={() => setView("list")}
              className={cn("p-1.5 rounded-md", view === "list" && "bg-background shadow-sm")}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView("grid")}
              className={cn("p-1.5 rounded-md", view === "grid" && "bg-background shadow-sm")}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={doNewFolder}>
            <Plus className="w-3.5 h-3.5" /> {t("files.new_folder")}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {view === "list" ? (
            <FileList
              entries={filtered}
              selected={selected}
              onSelect={onSelect}
              onActivate={onActivate}
              onContextMenu={onContextMenu}
            />
          ) : (
            <FileGrid
              entries={filtered}
              selected={selected}
              onSelect={onSelect}
              onActivate={onActivate}
              onContextMenu={onContextMenu}
            />
          )}
          {loading && (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> 加载中…
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
              此目录为空
            </div>
          )}
        </div>
      </div>

      {openWithFor && (
        <OpenWithDialog path={openWithFor} onClose={() => setOpenWithFor(null)} />
      )}
      {ctx && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          target={ctx.target}
          onAction={(act) => {
            switch (act) {
              case "open":
                onActivate(ctx.target);
                break;
              case "preview": {
                const items = (listing?.entries || [])
                  .filter((x) => !x.is_dir)
                  .map((x) => ({ path: x.path, name: x.name, is_dir: x.is_dir }));
                const idx = items.findIndex((x) => x.path === ctx.target.path);
                useQuickLook.getState().open(items, Math.max(0, idx));
                break;
              }
              case "open_with":
                setOpenWithFor(ctx.target.path);
                break;
              case "reveal":
                api.revealInFolder(ctx.target.path).catch(toastError);
                break;
              case "copy":
                doCopy("copy");
                break;
              case "cut":
                doCopy("cut");
                break;
              case "paste":
                doPaste();
                break;
              case "rename":
                doRename();
                break;
              case "delete":
                doDelete();
                break;
              case "version":
                doVersion();
                break;
              case "tag":
                api
                  .createTag("收藏", "#3B82F6")
                  .then((id) => api.assignTag(ctx.target.path, id))
                  .then(() => toast("标签已添加", "success"))
                  .catch(toastError);
                break;
              case "bookmark":
                api
                  .addBookmark(ctx.target.path, ctx.target.name)
                  .then(() => toast("已加入收藏", "success"))
                  .catch(toastError);
                break;
            }
            setCtx(null);
          }}
        />
      )}
      <AIPanel />
    </div>
  );
}

function Breadcrumbs({ path, onJump }: { path: string; onJump: (p: string) => void }) {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return (
    <div className="flex items-center gap-1 text-sm bg-secondary/60 rounded-lg px-3 py-1.5 flex-1 min-w-0 overflow-hidden">
      <button onClick={() => api.homeDir().then(onJump)} className="hover:text-primary">
        <HomeIcon className="w-3.5 h-3.5" />
      </button>
      {parts.map((p, i) => {
        const target = parts
          .slice(0, i + 1)
          .join(path.startsWith("/") ? "/" : "\\");
        const full = path.startsWith("/") ? `/${target}` : target;
        return (
          <div key={i} className="flex items-center gap-1 min-w-0">
            <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
            <button
              onClick={() => onJump(full)}
              className="hover:text-primary truncate"
            >
              {p}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function entryIcon(e: DirEntryInfo) {
  if (e.is_dir) return Folder;
  const ext = (e.extension || "").toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp", "heic", "tiff", "svg"].includes(ext)) return FileImage;
  if (["mp4", "mov", "mkv", "avi", "webm"].includes(ext)) return FileVideo;
  if (["mp3", "flac", "wav", "aac", "m4a"].includes(ext)) return FileAudio;
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return FileArchive;
  return FileText;
}

function FileList({
  entries,
  selected,
  onSelect,
  onActivate,
  onContextMenu,
}: {
  entries: DirEntryInfo[];
  selected: Set<string>;
  onSelect: (e: React.MouseEvent, entry: DirEntryInfo) => void;
  onActivate: (entry: DirEntryInfo) => void;
  onContextMenu: (e: React.MouseEvent, entry: DirEntryInfo) => void;
}) {
  const { t } = useTranslation();
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-background/95 backdrop-blur z-10">
        <tr className="text-left text-muted-foreground">
          <th className="px-6 py-2 font-medium">{t("files.name")}</th>
          <th className="px-4 py-2 font-medium w-44">{t("files.modified_at")}</th>
          <th className="px-4 py-2 font-medium w-24">{t("files.size")}</th>
          <th className="px-4 py-2 font-medium w-32">{t("files.type")}</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => {
          const Icon = entryIcon(e);
          const color = e.is_dir ? "text-blue-500" : fileIconColor(e.extension);
          return (
            <tr
              key={e.path}
              onClick={(ev) => onSelect(ev, e)}
              onDoubleClick={() => onActivate(e)}
              onContextMenu={(ev) => onContextMenu(ev, e)}
              className={cn(
                "border-b border-border/40 cursor-pointer hover:bg-accent/40",
                selected.has(e.path) && "bg-accent/60"
              )}
            >
              <td className="px-6 py-2.5">
                <div className="flex items-center gap-2.5">
                  <Icon className={cn("w-4 h-4", color)} />
                  <span className="truncate">{e.name}</span>
                </div>
              </td>
              <td className="px-4 py-2.5 text-muted-foreground">{formatTime(e.modified)}</td>
              <td className="px-4 py-2.5 text-muted-foreground">
                {e.is_dir ? "—" : formatBytes(e.size)}
              </td>
              <td className="px-4 py-2.5 text-muted-foreground">
                {e.is_dir ? "文件夹" : (e.extension || "").toUpperCase() || "文件"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function FileGrid({
  entries,
  selected,
  onSelect,
  onActivate,
  onContextMenu,
}: {
  entries: DirEntryInfo[];
  selected: Set<string>;
  onSelect: (e: React.MouseEvent, entry: DirEntryInfo) => void;
  onActivate: (entry: DirEntryInfo) => void;
  onContextMenu: (e: React.MouseEvent, entry: DirEntryInfo) => void;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3 p-4">
      {entries.map((e) => {
        const Icon = entryIcon(e);
        const color = e.is_dir ? "text-blue-500" : fileIconColor(e.extension);
        return (
          <div
            key={e.path}
            onClick={(ev) => onSelect(ev, e)}
            onDoubleClick={() => onActivate(e)}
            onContextMenu={(ev) => onContextMenu(ev, e)}
            className={cn(
              "flex flex-col items-center p-3 rounded-xl cursor-pointer hover:bg-accent/40",
              selected.has(e.path) && "bg-accent/60"
            )}
          >
            <Icon className={cn("w-10 h-10 mb-2", color)} />
            <div className="text-xs text-center break-all line-clamp-2">{e.name}</div>
          </div>
        );
      })}
    </div>
  );
}

function ContextMenu({
  x,
  y,
  target,
  onAction,
}: {
  x: number;
  y: number;
  target: DirEntryInfo;
  onAction: (act: string) => void;
}) {
  const { t } = useTranslation();
  const items = [
    { id: "open", icon: Folder, label: t("files.ctx.open") },
    { id: "preview", icon: Eye, label: t("files.ctx.preview") },
    { id: "open_with", icon: ExternalLink, label: "用其他应用打开…" },
    { id: "reveal", icon: FolderOpenIcon, label: "在 Finder / 资源管理器中显示" },
    { divider: true },
    { id: "copy", icon: Copy, label: t("files.ctx.copy") },
    { id: "cut", icon: Scissors, label: t("files.ctx.cut") },
    { id: "paste", icon: ClipboardPaste, label: t("files.ctx.paste") },
    { id: "rename", icon: Pencil, label: t("files.ctx.rename") },
    { divider: true },
    { id: "tag", icon: Tag, label: t("files.ctx.tag") },
    { id: "bookmark", icon: Upload, label: "加入收藏" },
    { id: "version", icon: History, label: t("files.ctx.version_history") },
    { divider: true },
    { id: "delete", icon: Trash2, label: t("files.ctx.delete"), danger: true },
    { id: "properties", icon: SettingsIcon, label: t("files.ctx.properties") },
  ] as Array<any>;
  void target;
  return (
    <div
      style={{ left: x, top: y }}
      className="fixed z-50 w-56 rounded-xl bg-card border border-border shadow-xl py-1.5 text-sm"
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((it, i) =>
        it.divider ? (
          <div key={i} className="my-1 border-t border-border/60" />
        ) : (
          <button
            key={i}
            onClick={() => onAction(it.id)}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-accent/60 rounded-md mx-1",
              it.danger && "text-rose-500"
            )}
          >
            {it.icon && <it.icon className="w-3.5 h-3.5" />}
            <span>{it.label}</span>
          </button>
        )
      )}
    </div>
  );
}
