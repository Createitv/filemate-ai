import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TopBar } from "@/components/layout/TopBar";
import { cn } from "@/lib/utils";
import { FileText, FileImage, FileVideo, Code2, ChevronLeft, ChevronRight } from "lucide-react";

export default function Preview() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"all" | "pinned">("all");

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
        <span className="text-xs text-muted-foreground">{t("preview.tabs.esc")}</span>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-8">
        <div className="grid grid-cols-4 gap-5">
          <PreviewTile
            kind="image"
            title="风景照.jpg"
            subtitle="3840 × 2160 · 8.2 MB"
            icon={FileImage}
            color="text-rose-500"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-400 via-emerald-300 to-amber-200" />
          </PreviewTile>

          <PreviewTile
            kind="pdf"
            title="产品手册.pdf"
            subtitle="36 页 · 4.1 MB"
            icon={FileText}
            color="text-blue-500"
          >
            <div className="absolute inset-0 bg-white p-4 text-[8px] leading-relaxed overflow-hidden">
              <div className="font-bold text-xs mb-2">产品手册 FileMate AI</div>
              <div className="text-muted-foreground">第一章 产品简介</div>
              <div className="mt-1 space-y-0.5 text-foreground/80">
                <div>FileMate 是新一代跨平台 AI 智能文件管理器...</div>
                <div>支持 Windows 与 macOS...</div>
                <div>核心功能：AI 搜索、版本控制、云存储统一</div>
              </div>
            </div>
          </PreviewTile>

          <PreviewTile
            kind="video"
            title="演示录屏.mp4"
            subtitle="02:34 · 1080p"
            icon={FileVideo}
            color="text-violet-500"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-violet-900 via-purple-700 to-pink-500 flex items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-white/30 backdrop-blur flex items-center justify-center">
                <div className="w-0 h-0 border-y-[8px] border-y-transparent border-l-[12px] border-l-white ml-1" />
              </div>
            </div>
            <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2 text-white text-[10px]">
              <ChevronLeft className="w-3 h-3" />
              <div className="flex-1 h-0.5 bg-white/30 rounded-full">
                <div className="h-full w-1/3 bg-white rounded-full" />
              </div>
              <ChevronRight className="w-3 h-3" />
            </div>
          </PreviewTile>

          <PreviewTile
            kind="code"
            title="main.rs"
            subtitle="Rust · 24 行"
            icon={Code2}
            color="text-emerald-500"
            dark
          >
            <pre className="absolute inset-0 p-3 text-[9px] leading-relaxed font-mono text-emerald-300 bg-slate-900 overflow-hidden">
{`use tauri::Manager;

fn main() {
  tauri::Builder::default()
    .setup(|app| {
      let win = app.get_webview_window("main")
        .unwrap();
      win.show().ok();
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error running tauri app");
}`}
            </pre>
          </PreviewTile>
        </div>
      </div>

      <footer className="h-12 border-t border-border/40 flex items-center justify-center gap-6 text-xs text-muted-foreground">
        <span>← / → 切换</span>
        <span>空格预览</span>
        <span>ESC 关闭</span>
      </footer>
    </div>
  );
}

function PreviewTile({
  title,
  subtitle,
  icon: Icon,
  color,
  dark,
  children,
}: {
  kind: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  dark?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="group">
      <div
        className={cn(
          "relative aspect-[3/4] rounded-2xl overflow-hidden border border-border/60 shadow-sm",
          "hover:shadow-xl hover:-translate-y-0.5 transition cursor-pointer",
          dark ? "bg-slate-900" : "bg-card"
        )}
      >
        {children}
      </div>
      <div className="mt-2 flex items-center gap-2 px-1">
        <Icon className={cn("w-3.5 h-3.5", color)} />
        <div className="min-w-0 flex-1">
          <div className="text-sm truncate">{title}</div>
          <div className="text-[11px] text-muted-foreground">{subtitle}</div>
        </div>
      </div>
    </div>
  );
}
