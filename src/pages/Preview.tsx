import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TopBar } from "@/components/layout/TopBar";
import { cn } from "@/lib/utils";
import { FileText, FileImage, FileVideo, Code2, FolderOpen } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import * as api from "@/api";
import type { PreviewMeta } from "@/api/types";
import { toastError } from "@/components/ui/toast";
import { formatBytes } from "@/lib/format";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";

interface Item {
  path: string;
  meta: PreviewMeta;
}

export default function Preview() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"all" | "pinned">("all");
  const [items, setItems] = useState<Item[]>([]);
  const [active, setActive] = useState<Item | null>(null);

  const pickFiles = async () => {
    const r = await openDialog({ multiple: true });
    if (!r) return;
    const arr = Array.isArray(r) ? r.map(String) : [String(r)];
    const next: Item[] = [];
    for (const p of arr) {
      try {
        const meta = await api.previewFile(p);
        next.push({ path: p, meta });
      } catch (e) {
        toastError(e);
      }
    }
    setItems(next);
    setActive(next[0] || null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(null);
      else if (e.key === "ArrowRight" && items.length) {
        const i = active ? items.findIndex((x) => x.path === active.path) : -1;
        setActive(items[(i + 1) % items.length]);
      } else if (e.key === "ArrowLeft" && items.length) {
        const i = active ? items.findIndex((x) => x.path === active.path) : 0;
        setActive(items[(i - 1 + items.length) % items.length]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, active]);

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-gradient-to-br from-slate-100 via-white to-blue-50 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900">
      <TopBar title={t("preview.title")} />
      <div className="px-6 py-3 flex items-center gap-2 border-b border-border/40">
        {(["all", "pinned"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              "px-3 py-1.5 text-sm rounded-lg",
              tab === k ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t(`preview.tabs.${k}`)}
          </button>
        ))}
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={pickFiles}>
          <FolderOpen className="w-4 h-4" /> 选择文件
        </Button>
        <span className="text-xs text-muted-foreground">{t("preview.tabs.esc")}</span>
      </div>

      {active ? (
        <div className="flex-1 p-6 grid grid-cols-[200px_1fr] gap-4 overflow-hidden">
          <div className="space-y-2 overflow-y-auto">
            {items.map((it) => (
              <button
                key={it.path}
                onClick={() => setActive(it)}
                className={cn(
                  "w-full text-left p-2 rounded-lg text-xs",
                  active.path === it.path ? "bg-primary/10 border border-primary/30" : "hover:bg-accent/40"
                )}
              >
                <div className="truncate font-medium">{it.path.split(/[\\/]/).pop()}</div>
                <div className="text-muted-foreground mt-0.5">
                  {it.meta.kind} · {formatBytes(it.meta.size)}
                </div>
              </button>
            ))}
          </div>
          <PreviewBody item={active} />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-8">
          <div className="grid grid-cols-4 gap-5">
            {items.map((it) => (
              <PreviewTile key={it.path} item={it} onClick={() => setActive(it)} />
            ))}
            {items.length === 0 && (
              <div className="col-span-4 text-center text-sm text-muted-foreground py-12">
                选择文件以预览
              </div>
            )}
          </div>
        </div>
      )}

      <footer className="h-12 border-t border-border/40 flex items-center justify-center gap-6 text-xs text-muted-foreground">
        <span>← / → 切换</span>
        <span>空格预览</span>
        <span>ESC 关闭</span>
      </footer>
    </div>
  );
}

function PreviewBody({ item }: { item: Item }) {
  const { meta, path } = item;
  const url = convertFileSrc(path);
  if (meta.kind === "image") {
    return <img src={url} alt="" className="max-h-full max-w-full mx-auto rounded-xl shadow-lg" />;
  }
  if (meta.kind === "video") {
    return (
      <video src={url} controls className="max-h-full max-w-full mx-auto rounded-xl shadow-lg" />
    );
  }
  if (meta.kind === "audio") {
    return <audio src={url} controls className="w-full mt-4" />;
  }
  if (meta.kind === "pdf") {
    return <iframe src={url} className="w-full h-full border rounded-xl" />;
  }
  if (meta.kind === "markdown" && meta.text) {
    return (
      <div className="prose prose-sm dark:prose-invert max-w-none overflow-y-auto bg-card rounded-xl p-6 shadow-lg">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{meta.text}</ReactMarkdown>
      </div>
    );
  }
  if ((meta.kind === "code" || meta.kind === "text") && meta.text) {
    return (
      <pre className="overflow-auto bg-slate-900 text-emerald-300 rounded-xl p-4 text-xs font-mono leading-relaxed">
        {meta.text}
      </pre>
    );
  }
  return (
    <div className="flex items-center justify-center text-muted-foreground">
      不支持的预览类型：{meta.mime}
    </div>
  );
}

function PreviewTile({ item, onClick }: { item: Item; onClick: () => void }) {
  const { meta, path } = item;
  const url = convertFileSrc(path);
  const Icon =
    meta.kind === "image"
      ? FileImage
      : meta.kind === "video"
      ? FileVideo
      : meta.kind === "code"
      ? Code2
      : FileText;

  return (
    <div className="group cursor-pointer" onClick={onClick}>
      <div className="relative aspect-[3/4] rounded-2xl overflow-hidden border border-border/60 shadow-sm bg-card hover:shadow-xl hover:-translate-y-0.5 transition">
        {meta.kind === "image" ? (
          <img src={url} className="absolute inset-0 w-full h-full object-cover" />
        ) : meta.kind === "code" || meta.kind === "text" ? (
          <pre className="absolute inset-0 p-3 text-[9px] leading-relaxed font-mono text-emerald-300 bg-slate-900 overflow-hidden">
            {meta.text?.slice(0, 1500)}
          </pre>
        ) : meta.kind === "markdown" ? (
          <div className="absolute inset-0 p-3 text-[9px] overflow-hidden bg-white">
            {meta.text?.slice(0, 1500)}
          </div>
        ) : meta.kind === "video" ? (
          <video src={url} className="absolute inset-0 w-full h-full object-cover" muted />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-500 to-violet-500">
            <Icon className="w-12 h-12 text-white/80" />
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2 px-1">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="text-sm truncate">{path.split(/[\\/]/).pop()}</div>
          <div className="text-[11px] text-muted-foreground">
            {meta.kind} · {formatBytes(meta.size)}
          </div>
        </div>
      </div>
    </div>
  );
}
