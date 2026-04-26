// QuickLook overlay (Space-key invoked, ESC-closes). Designed to match the
// jpg-preview.png mock: header with title + tabs + window controls,
// big preview area on the left, properties panel on the right, and a
// thumbnail strip at the bottom for navigating between selected items.

import { useEffect, useState } from "react";
import { X, Maximize, Minimize, ChevronLeft, ChevronRight, FolderOpen, Loader2 } from "lucide-react";
import { useQuickLook } from "./useQuickLook";
import { PropsPanel } from "./PropsPanel";
import { ImageRenderer } from "./renderers/Image";
import { VideoRenderer } from "./renderers/Video";
import { AudioRenderer } from "./renderers/Audio";
import { CodeRenderer } from "./renderers/Code";
import { MarkdownRenderer } from "./renderers/Markdown";
import { PdfRenderer } from "./renderers/Pdf";
import { ArchiveRenderer } from "./renderers/Archive";
import { FontRenderer } from "./renderers/Font";
import { SvgRenderer } from "./renderers/Svg";
import { GenericRenderer } from "./renderers/Generic";
import * as api from "@/api";
import type { PreviewMeta } from "@/api/types";
import { fileIconColor } from "@/lib/format";
import { convertFileSrc } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import { OpenWithMenu } from "@/components/OpenWithMenu";

export function QuickLook() {
  const { visible, items, index, close, next, prev, setIndex } = useQuickLook();
  const [meta, setMeta] = useState<PreviewMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maximized, setMaximized] = useState(false);

  const current = items[index];

  useEffect(() => {
    if (!visible || !current) return;
    if (current.is_dir) {
      setMeta(null);
      setError("目录不支持预览");
      return;
    }
    setLoading(true);
    setError(null);
    setMeta(null);
    api
      .previewFile(current.path)
      .then(setMeta)
      .catch((e) => setError(String(e?.message || e)))
      .finally(() => setLoading(false));
  }, [visible, current]);

  // global keyboard
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === " ") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowRight") {
        next();
      } else if (e.key === "ArrowLeft") {
        prev();
      } else if (e.key === "Enter" && current) {
        api.openPath(current.path);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, close, next, prev, current]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "relative bg-card rounded-2xl shadow-2xl border border-border/60 flex flex-col overflow-hidden transition-all",
          maximized ? "w-[98vw] h-[96vh]" : "w-[min(1300px,92vw)] h-[min(820px,88vh)]"
        )}
      >
        {/* Header */}
        <header className="h-12 shrink-0 flex items-center gap-3 px-4 border-b border-border/40 bg-background/40">
          <div className="flex items-center gap-1">
            <WindowDot color="bg-rose-500" onClick={close} />
            <WindowDot color="bg-amber-500" />
            <WindowDot color="bg-emerald-500" onClick={() => setMaximized((m) => !m)} />
          </div>
          {current && (
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className={cn("w-2 h-2 rounded-full", current.is_dir ? "bg-blue-500" : fileIconColor(current.path.split(".").pop()))} />
              <span className="font-medium text-sm truncate">{current.name}</span>
              {meta && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground uppercase">
                  {meta.kind}
                </span>
              )}
            </div>
          )}

          <div className="flex items-center gap-1">
            <HeaderBtn onClick={() => current && api.openPath(current.path)} title="用默认程序打开">
              <FolderOpen className="w-3.5 h-3.5" />
            </HeaderBtn>
            {current && <OpenWithMenu path={current.path} variant="button" />}
            <HeaderBtn onClick={() => setMaximized((m) => !m)} title="最大化">
              {maximized ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
            </HeaderBtn>
            <HeaderBtn onClick={close} title="关闭 (Esc)">
              <X className="w-3.5 h-3.5" />
            </HeaderBtn>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 min-w-0 relative">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground bg-background/80 backdrop-blur z-10">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                读取中…
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center text-rose-500 text-sm">
                {error}
              </div>
            )}
            {meta && current && <Renderer meta={meta} path={current.path} />}
          </div>
          {meta && current && <PropsPanel path={current.path} meta={meta} />}
        </div>

        {/* Thumbnails strip + nav */}
        {items.length > 1 && (
          <footer className="h-24 shrink-0 border-t border-border/40 bg-background/40 flex items-center px-4 gap-3">
            <button
              onClick={prev}
              className="w-8 h-8 rounded-full bg-card border border-border/60 hover:bg-accent/60 flex items-center justify-center"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex-1 overflow-x-auto scrollbar-thin">
              <div className="flex items-center gap-2 h-full">
                {items.map((it, i) => (
                  <button
                    key={it.path}
                    onClick={() => setIndex(i)}
                    className={cn(
                      "shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition",
                      i === index ? "border-primary scale-105" : "border-transparent opacity-70 hover:opacity-100"
                    )}
                  >
                    <Thumbnail path={it.path} />
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={next}
              className="w-8 h-8 rounded-full bg-card border border-border/60 hover:bg-accent/60 flex items-center justify-center"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <div className="text-xs text-muted-foreground whitespace-nowrap pl-2 border-l border-border/40 ml-1">
              {index + 1} / {items.length} · 空格关闭 · ← → 切换
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}

function Renderer({ meta, path }: { meta: PreviewMeta; path: string }) {
  switch (meta.kind) {
    case "image":
      return <ImageRenderer path={path} />;
    case "video":
      return <VideoRenderer path={path} />;
    case "audio":
      return (
        <AudioRenderer
          path={path}
          meta={meta.extras?.kind === "audio" ? meta.extras : undefined}
        />
      );
    case "pdf":
      return <PdfRenderer path={path} />;
    case "markdown":
      return <MarkdownRenderer text={meta.text || ""} />;
    case "code":
    case "text":
      return <CodeRenderer text={meta.text || ""} language={meta.language} />;
    case "archive":
      return <ArchiveRenderer path={path} />;
    case "font":
      return (
        <FontRenderer
          path={path}
          meta={meta.extras?.kind === "font" ? meta.extras : undefined}
        />
      );
    case "svg":
      return <SvgRenderer path={path} text={meta.text} />;
    case "raw":
      return <GenericRenderer path={path} hint="RAW 文件需要专门解码器，可点下方按钮用默认软件打开" />;
    case "psd":
      return <GenericRenderer path={path} hint="PSD/PSB 需要 Photoshop 等图层渲染引擎" />;
    case "model3d":
      return <GenericRenderer path={path} hint="3D 模型预览需要 WebGL 加载器" />;
    case "office":
      return <GenericRenderer path={path} hint="Office 文档需要 LibreOffice 后端，请用默认程序打开" />;
    default:
      return <GenericRenderer path={path} />;
  }
}

function Thumbnail({ path }: { path: string }) {
  const ext = (path.split(".").pop() || "").toLowerCase();
  const isImage = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "svg"].includes(ext);
  if (isImage) {
    return <img src={convertFileSrc(path)} alt="" className="w-full h-full object-cover" />;
  }
  return (
    <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground bg-muted">
      .{ext}
    </div>
  );
}

function HeaderBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-7 h-7 rounded-md text-muted-foreground hover:bg-accent/40 hover:text-foreground flex items-center justify-center"
    >
      {children}
    </button>
  );
}

function WindowDot({ color, onClick }: { color: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn("w-3 h-3 rounded-full", color, "hover:opacity-80 transition")}
    />
  );
}
