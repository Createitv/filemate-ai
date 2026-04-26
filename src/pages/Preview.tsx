// Gallery view: pick a folder or files, see thumbnails, click to open the
// shared QuickLook overlay (also reachable via Space anywhere in the app).

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TopBar } from "@/components/layout/TopBar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import * as api from "@/api";
import type { DirEntryInfo } from "@/api/types";
import { useQuickLook } from "@/components/preview/useQuickLook";
import {
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  Code2,
  FolderOpen,
  Music,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fileIconColor, formatBytes } from "@/lib/format";
import { toastError } from "@/components/ui/toast";

export default function Preview() {
  const { t } = useTranslation();
  const { open } = useQuickLook();
  const [items, setItems] = useState<DirEntryInfo[]>([]);
  const [filter, setFilter] = useState<string>("all");

  const pickFolder = async () => {
    const r = await openDialog({ directory: true, multiple: false });
    if (!r) return;
    try {
      const list = await api.listDir(String(r));
      setItems(list.entries.filter((x) => !x.is_dir));
    } catch (e) {
      toastError(e);
    }
  };

  const pickFiles = async () => {
    const r = await openDialog({ multiple: true });
    if (!r) return;
    const arr = Array.isArray(r) ? r.map(String) : [String(r)];
    const metas = await Promise.all(
      arr.map((p) => api.metadata(p).catch(() => null))
    );
    setItems(metas.filter(Boolean) as DirEntryInfo[]);
  };

  const filtered = items.filter((it) => filterMatch(it, filter));

  const launch = (idx: number) => {
    open(
      filtered.map((x) => ({ path: x.path, name: x.name, is_dir: x.is_dir })),
      idx
    );
  };

  // launch first item with Space-shortcut hint on landing
  useEffect(() => {
    void t;
  }, [t]);

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-gradient-to-br from-slate-100 via-white to-blue-50 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900">
      <TopBar title="预览" />
      <div className="px-6 py-3 flex items-center gap-2 border-b border-border/40">
        {(["all", "image", "video", "audio", "doc", "code"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={cn(
              "px-3 py-1.5 text-sm rounded-lg",
              filter === k ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label(k)}
          </button>
        ))}
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={pickFolder}>
          <FolderOpen className="w-4 h-4" /> 选目录
        </Button>
        <Button size="sm" onClick={pickFiles}>
          <FolderOpen className="w-4 h-4" /> 选文件
        </Button>
        <span className="text-xs text-muted-foreground pl-2 border-l border-border/40 ml-1">
          双击 / 空格预览 · ESC 关闭
        </span>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-6">
        {filtered.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-12">
            选择目录或文件来浏览
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
            {filtered.map((it, i) => (
              <button key={it.path} onClick={() => launch(i)} className="group text-left">
                <Card className="p-0 overflow-hidden aspect-square hover:shadow-xl hover:-translate-y-0.5 transition">
                  <Tile entry={it} />
                </Card>
                <div className="mt-2 flex items-center gap-1.5 px-1">
                  <Icon entry={it} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs truncate">{it.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {formatBytes(it.size)}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function label(k: string): string {
  return k === "all"
    ? "全部"
    : k === "image"
    ? "图片"
    : k === "video"
    ? "视频"
    : k === "audio"
    ? "音频"
    : k === "doc"
    ? "文档"
    : k === "code"
    ? "代码"
    : k;
}

function filterMatch(it: DirEntryInfo, filter: string): boolean {
  if (filter === "all") return true;
  const ext = (it.extension || "").toLowerCase();
  const mime = it.mime || "";
  if (filter === "image") return mime.startsWith("image/") || ["heic", "raw", "cr2", "nef", "arw"].includes(ext);
  if (filter === "video") return mime.startsWith("video/");
  if (filter === "audio") return mime.startsWith("audio/");
  if (filter === "doc") return ["pdf", "md", "markdown", "doc", "docx", "ppt", "pptx", "xls", "xlsx"].includes(ext);
  if (filter === "code")
    return [
      "rs", "go", "py", "js", "ts", "tsx", "jsx", "java", "c", "cpp", "h", "rb",
      "php", "html", "css", "json", "yaml", "toml", "sh",
    ].includes(ext);
  return true;
}

function Icon({ entry }: { entry: DirEntryInfo }) {
  const ext = (entry.extension || "").toLowerCase();
  const mime = entry.mime || "";
  const C = mime.startsWith("image/")
    ? FileImage
    : mime.startsWith("video/")
    ? FileVideo
    : mime.startsWith("audio/")
    ? FileAudio
    : ["zip", "rar", "7z", "tar", "gz"].includes(ext)
    ? FileArchive
    : ["rs", "ts", "tsx", "js", "jsx", "py"].includes(ext)
    ? Code2
    : FileText;
  return <C className={cn("w-3.5 h-3.5", fileIconColor(ext))} />;
}

function Tile({ entry }: { entry: DirEntryInfo }) {
  const ext = (entry.extension || "").toLowerCase();
  const mime = entry.mime || "";
  if (mime.startsWith("image/") || ext === "svg") {
    return <img src={convertFileSrc(entry.path)} alt="" className="w-full h-full object-cover" />;
  }
  if (mime.startsWith("video/")) {
    return <video src={convertFileSrc(entry.path)} muted className="w-full h-full object-cover" />;
  }
  if (mime.startsWith("audio/")) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-500 to-fuchsia-500">
        <Music className="w-10 h-10 text-white/80" />
      </div>
    );
  }
  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-200 to-slate-100 dark:from-slate-800 dark:to-slate-900">
      <span className="text-2xl font-bold text-muted-foreground/60">.{ext}</span>
    </div>
  );
}
