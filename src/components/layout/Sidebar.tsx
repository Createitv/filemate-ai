import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Home,
  Folder,
  Star,
  Search,
  LayoutGrid,
  Sparkles,
  Tags,
  Wand2,
  Eye,
  Cloud,
  Settings,
  Lock,
  TerminalSquare,
  Copy,
  Pencil,
  History,
  Brain,
  Bot,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLayoutStore } from "@/stores/layout";

const main = [
  { to: "/", icon: Home, key: "nav.home", end: true },
  { to: "/files", icon: Folder, key: "nav.files" },
  { to: "/favorites", icon: Star, key: "nav.favorites" },
  { to: "/search", icon: Search, key: "nav.search" },
  { to: "/workspace", icon: LayoutGrid, key: "nav.workspace" },
  { to: "/tags", icon: Tags, key: "nav.tags" },
];

const ai = [
  { to: "/analyze", icon: Brain, label: "智能分析" },
  { to: "/ai-providers", icon: Bot, label: "AI 模型" },
];

const tools = [
  { to: "/automation", icon: Wand2, key: "nav.automation" },
  { to: "/preview", icon: Eye, key: "nav.preview" },
  { to: "/versions", icon: History, label: "版本历史" },
  { to: "/rename", icon: Pencil, label: "批量重命名" },
  { to: "/duplicates", icon: Copy, label: "重复文件" },
  { to: "/encryption", icon: Lock, label: "加密 / 解密" },
  { to: "/terminal", icon: TerminalSquare, label: "终端" },
];

const cloud = [{ to: "/cloud", icon: Cloud, key: "cloud.title" }];

export function Sidebar() {
  const { t } = useTranslation();
  const collapsed = useLayoutStore((s) => s.sidebarCollapsed);
  const toggle = useLayoutStore((s) => s.toggleSidebar);

  return (
    <aside
      className={cn(
        "relative shrink-0 bg-sidebar text-sidebar-foreground border-r border-border/60 flex flex-col transition-[width] duration-200 ease-out",
        collapsed ? "w-14" : "w-56"
      )}
    >
      <div className={cn("flex items-center gap-2 px-3 py-4", collapsed && "justify-center px-0")}>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <span className="font-semibold tracking-tight truncate">{t("app.name")}</span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-4 space-y-4">
        <div className="space-y-0.5">
          {main.map((it) => (
            <Item key={it.to} {...it} label={t(it.key as string)} collapsed={collapsed} />
          ))}
        </div>

        <Section label="AI" collapsed={collapsed}>
          {ai.map((it) => (
            <Item key={it.to} {...it} label={(it as any).label} collapsed={collapsed} />
          ))}
        </Section>

        <Section label="工具" collapsed={collapsed}>
          {tools.map((it) => (
            <Item
              key={it.to}
              {...it}
              label={(it as any).key ? t((it as any).key) : (it as any).label}
              collapsed={collapsed}
            />
          ))}
        </Section>

        <Section label={t("cloud.title")} collapsed={collapsed}>
          {cloud.map((it) => (
            <Item key={it.to} {...it} label={t(it.key as string)} collapsed={collapsed} />
          ))}
        </Section>

        <div className="border-t border-border/60 pt-3">
          <Item to="/settings" icon={Settings} label={t("nav.settings")} collapsed={collapsed} />
        </div>
      </nav>

      {/* Toggle button half-overlapping the right edge */}
      <button
        onClick={toggle}
        title={collapsed ? "展开侧边栏" : "收起侧边栏"}
        className="absolute -right-3 top-16 z-30 w-6 h-6 rounded-full border border-border bg-card shadow flex items-center justify-center hover:bg-accent/60"
      >
        {collapsed ? (
          <ChevronRight className="w-3.5 h-3.5" />
        ) : (
          <ChevronLeft className="w-3.5 h-3.5" />
        )}
      </button>
    </aside>
  );
}

function Section({
  label,
  collapsed,
  children,
}: {
  label: string;
  collapsed: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      {!collapsed ? (
        <div className="px-3 mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
      ) : (
        <div className="mx-3 my-2 border-t border-border/40" />
      )}
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Item({
  to,
  icon: Icon,
  label,
  end,
  collapsed,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  end?: boolean;
  collapsed?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2.5 rounded-lg text-sm transition-colors",
          collapsed ? "justify-center w-10 h-10 mx-auto" : "px-3 py-2",
          isActive
            ? "bg-accent text-accent-foreground font-medium"
            : "text-sidebar-foreground/80 hover:bg-accent/60 hover:text-accent-foreground"
        )
      }
    >
      <Icon className="w-4 h-4 shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );
}
