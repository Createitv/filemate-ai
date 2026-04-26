import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Folder,
  FileText,
  FileImage,
  FileVideo,
  FileArchive,
  ChevronRight,
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
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { AIPanel } from "@/components/layout/AIPanel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Row = {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  modified: string;
  size: string;
  type: string;
  isFolder?: boolean;
};

const rows: Row[] = [
  { name: "Apps", icon: Folder, color: "text-blue-500", modified: "2026/4/22 10:30", size: "—", type: "文件夹", isFolder: true },
  { name: "Program Files", icon: Folder, color: "text-blue-500", modified: "2026/4/20 14:11", size: "—", type: "文件夹", isFolder: true },
  { name: "Windows", icon: Folder, color: "text-blue-500", modified: "2026/4/18 09:02", size: "—", type: "文件夹", isFolder: true },
  { name: "工作文件", icon: Folder, color: "text-amber-500", modified: "2026/4/22 18:30", size: "—", type: "文件夹", isFolder: true },
  { name: "Q4 营收分析.xlsx", icon: FileText, color: "text-green-500", modified: "2026/4/22 16:55", size: "1.2 MB", type: "Excel" },
  { name: "演示录屏.mp4", icon: FileVideo, color: "text-violet-500", modified: "2026/4/22 09:30", size: "284 MB", type: "视频" },
  { name: "团队照片.zip", icon: FileArchive, color: "text-rose-500", modified: "2026/4/21 12:11", size: "612 MB", type: "压缩包" },
  { name: "封面设计.png", icon: FileImage, color: "text-pink-500", modified: "2026/4/21 10:55", size: "8.2 MB", type: "图片" },
  { name: "产品需求文档.docx", icon: FileText, color: "text-blue-500", modified: "2026/4/20 15:45", size: "240 KB", type: "Word" },
];

export default function Files() {
  const { t } = useTranslation();
  const [view, setView] = useState<"list" | "grid">("list");
  const [selected, setSelected] = useState<string | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const close = () => setCtx(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  return (
    <div className="flex-1 flex min-w-0">
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar title={t("files.title")} />
        <div className="px-6 py-3 border-b border-border/60 flex items-center gap-3">
          <Breadcrumbs />
          <div className="flex-1" />
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
          <Button variant="outline" size="sm">
            <Plus className="w-3.5 h-3.5" /> {t("files.new_folder")}
          </Button>
          <Button size="sm">
            <Upload className="w-3.5 h-3.5" /> {t("files.upload")}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
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
              {rows.map((r) => (
                <tr
                  key={r.name}
                  onClick={() => setSelected(r.name)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setSelected(r.name);
                    setCtx({ x: e.clientX, y: e.clientY });
                  }}
                  className={cn(
                    "border-b border-border/40 cursor-pointer hover:bg-accent/40",
                    selected === r.name && "bg-accent/60"
                  )}
                >
                  <td className="px-6 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <r.icon className={cn("w-4 h-4", r.color)} />
                      <span>{r.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.modified}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.size}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {ctx && <ContextMenu x={ctx.x} y={ctx.y} />}
      <AIPanel />
    </div>
  );
}

function Breadcrumbs() {
  const parts = ["此电脑", "C:", "Users", "Ling"];
  return (
    <div className="flex items-center gap-1 text-sm bg-secondary/60 rounded-lg px-3 py-1.5 flex-1 max-w-md">
      {parts.map((p, i) => (
        <div key={i} className="flex items-center gap-1">
          <span className="hover:text-primary cursor-pointer">{p}</span>
          {i < parts.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
        </div>
      ))}
    </div>
  );
}

function ContextMenu({ x, y }: { x: number; y: number }) {
  const { t } = useTranslation();
  const items = [
    { icon: Eye, label: t("files.ctx.preview") },
    { icon: Folder, label: t("files.ctx.open") },
    { icon: SettingsIcon, label: t("files.ctx.open_with") },
    { divider: true },
    { icon: Copy, label: t("files.ctx.copy") },
    { icon: Scissors, label: t("files.ctx.cut") },
    { icon: ClipboardPaste, label: t("files.ctx.paste") },
    { icon: Pencil, label: t("files.ctx.rename") },
    { divider: true },
    { icon: Tag, label: t("files.ctx.tag") },
    { icon: History, label: t("files.ctx.version_history") },
    { icon: Sparkles, label: t("files.ctx.ai_organize"), highlight: true },
    { divider: true },
    { icon: Trash2, label: t("files.ctx.delete"), danger: true },
    { icon: SettingsIcon, label: t("files.ctx.properties") },
  ] as Array<{
    icon?: React.ComponentType<{ className?: string }>;
    label?: string;
    divider?: boolean;
    danger?: boolean;
    highlight?: boolean;
  }>;
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
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-accent/60 rounded-md mx-1",
              it.danger && "text-rose-500",
              it.highlight && "text-primary"
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
