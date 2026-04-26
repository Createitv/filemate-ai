// Native-file-manager-inspired sidebar. Mirrors Finder/Explorer layout with
// distinct sections: top-level pages → quick access (standard dirs +
// bookmarks) → this PC (real disks) → tags → cloud accounts → tools
// (collapsible) → settings/trash. Empty sections collapse automatically.

import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import {
  Home,
  Folder,
  Search,
  Sparkles,
  Settings,
  Star,
  Download,
  FileText,
  Image as ImageIcon,
  Video,
  Music,
  HardDrive,
  Tag as TagIcon,
  Cloud as CloudIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LayoutGrid,
  Brain,
  Wand2,
  Eye,
  History,
  Pencil,
  Copy,
  Lock,
  TerminalSquare,
  Bot,
  Wrench,
  Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLayoutStore } from "@/stores/layout";
import * as api from "@/api";
import type { Bookmark, DiskInfo, Tag, UserDir, CloudAccount } from "@/api/types";
import { formatBytes } from "@/lib/format";

const DIR_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  home: Home,
  desktop: Monitor,
  download: Download,
  document: FileText,
  picture: ImageIcon,
  video: Video,
  audio: Music,
};

const TOOLS = [
  { to: "/automation", icon: Wand2, label: "自动化" },
  { to: "/preview", icon: Eye, label: "预览画廊" },
  { to: "/versions", icon: History, label: "版本历史" },
  { to: "/rename", icon: Pencil, label: "批量重命名" },
  { to: "/duplicates", icon: Copy, label: "重复文件" },
  { to: "/encryption", icon: Lock, label: "加密 / 解密" },
  { to: "/terminal", icon: TerminalSquare, label: "终端" },
  { to: "/ai-providers", icon: Bot, label: "AI 模型" },
];

export function Sidebar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const collapsed = useLayoutStore((s) => s.sidebarCollapsed);
  const toggle = useLayoutStore((s) => s.toggleSidebar);

  const [userDirs, setUserDirs] = useState<UserDir[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [disks, setDisks] = useState<DiskInfo[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [clouds, setClouds] = useState<CloudAccount[]>([]);
  const [toolsOpen, setToolsOpen] = useState(false);

  useEffect(() => {
    api.listUserDirs().then(setUserDirs).catch(() => {});
    api.listBookmarks().then(setBookmarks).catch(() => {});
    api.listDisks().then(setDisks).catch(() => {});
    api.listTags().then(setTags).catch(() => {});
    api.listCloudAccounts().then(setClouds).catch(() => {});
  }, []);

  const goPath = (path: string) => navigate(`/files?path=${encodeURIComponent(path)}`);

  return (
    <aside
      className={cn(
        "relative shrink-0 bg-sidebar text-sidebar-foreground border-r border-border/60 flex flex-col transition-[width] duration-200 ease-out",
        collapsed ? "w-14" : "w-60"
      )}
    >
      {/* Brand */}
      <div className={cn("flex items-center gap-2 px-3 py-3.5", collapsed && "justify-center px-0")}>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4 text-primary-foreground" />
        </div>
        {!collapsed && <span className="font-semibold tracking-tight truncate">{t("app.name")}</span>}
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-4 space-y-3">
        {/* Top-level pages */}
        <div className="space-y-0.5">
          <Item to="/" icon={Home} label={t("nav.home")} collapsed={collapsed} end />
          <Item to="/files" icon={Folder} label={t("nav.files")} collapsed={collapsed} />
          <Item to="/search" icon={Search} label={t("nav.search")} collapsed={collapsed} />
          <Item to="/analyze" icon={Brain} label="智能分析" collapsed={collapsed} />
          <Item to="/workspace" icon={LayoutGrid} label={t("nav.workspace")} collapsed={collapsed} />
        </div>

        {/* Quick Access */}
        <Section label="快速访问" collapsed={collapsed}>
          {userDirs.map((d) => {
            const Icon = DIR_ICONS[d.kind] || Folder;
            const active = isCurrentPath(location, d.path);
            return (
              <PathButton
                key={d.path}
                icon={Icon}
                label={d.name}
                onClick={() => goPath(d.path)}
                active={active}
                collapsed={collapsed}
              />
            );
          })}
          {bookmarks.map((b) => (
            <PathButton
              key={b.id}
              icon={Star}
              iconClass="text-amber-500 fill-amber-500"
              label={b.name}
              onClick={() => goPath(b.path)}
              active={isCurrentPath(location, b.path)}
              collapsed={collapsed}
            />
          ))}
          <PathButton
            icon={Star}
            label="管理收藏"
            onClick={() => navigate("/favorites")}
            collapsed={collapsed}
            muted
          />
        </Section>

        {/* This PC / disks */}
        {disks.length > 0 && (
          <Section label="此电脑" collapsed={collapsed}>
            {disks.map((d) => {
              const name =
                d.mount_point === "/"
                  ? "系统盘"
                  : d.mount_point.split(/[\\/]/).filter(Boolean).pop() || d.mount_point;
              return (
                <DiskRow
                  key={d.mount_point}
                  disk={d}
                  name={name}
                  onClick={() => goPath(d.mount_point)}
                  active={isCurrentPath(location, d.mount_point)}
                  collapsed={collapsed}
                />
              );
            })}
          </Section>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <Section label={t("nav.tags")} collapsed={collapsed}>
            {tags.slice(0, 10).map((tg) => (
              <button
                key={tg.id}
                onClick={() => navigate("/tags")}
                title={collapsed ? tg.name : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg text-sm w-full",
                  collapsed ? "justify-center w-10 h-10 mx-auto" : "px-3 py-1.5",
                  "text-sidebar-foreground/80 hover:bg-accent/60 hover:text-accent-foreground"
                )}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: tg.color }}
                />
                {!collapsed && <span className="truncate">{tg.name}</span>}
              </button>
            ))}
            {tags.length > 10 && !collapsed && (
              <button
                onClick={() => navigate("/tags")}
                className="text-xs text-muted-foreground hover:text-primary px-3 py-1"
              >
                +{tags.length - 10} 更多
              </button>
            )}
            <PathButton
              icon={TagIcon}
              label="管理标签"
              onClick={() => navigate("/tags")}
              collapsed={collapsed}
              muted
            />
          </Section>
        )}

        {/* Cloud */}
        <Section label={t("cloud.title")} collapsed={collapsed}>
          {clouds.map((c) => (
            <PathButton
              key={c.id}
              icon={CloudIcon}
              label={c.name}
              onClick={() => navigate("/cloud")}
              collapsed={collapsed}
            />
          ))}
          <PathButton
            icon={CloudIcon}
            label={clouds.length === 0 ? "添加云账号" : "管理云账号"}
            onClick={() => navigate("/cloud")}
            collapsed={collapsed}
            muted
          />
        </Section>

        {/* Tools (collapsible) */}
        <div>
          {!collapsed ? (
            <button
              onClick={() => setToolsOpen((o) => !o)}
              className="w-full flex items-center gap-1 px-3 mb-1 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              <ChevronDown
                className={cn(
                  "w-3 h-3 transition-transform",
                  toolsOpen ? "rotate-0" : "-rotate-90"
                )}
              />
              <span>工具</span>
            </button>
          ) : (
            <div className="mx-3 my-2 border-t border-border/40" />
          )}
          {(collapsed || toolsOpen) && (
            <div className="space-y-0.5">
              {TOOLS.map((tool) => (
                <Item
                  key={tool.to}
                  to={tool.to}
                  icon={tool.icon}
                  label={tool.label}
                  collapsed={collapsed}
                />
              ))}
            </div>
          )}
          {!collapsed && !toolsOpen && (
            <button
              onClick={() => setToolsOpen(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg text-sidebar-foreground/80 hover:bg-accent/60 hover:text-accent-foreground"
            >
              <Wrench className="w-4 h-4 shrink-0" />
              <span className="truncate flex-1 text-left">展开工具 ({TOOLS.length})</span>
            </button>
          )}
        </div>
      </nav>

      <div className="border-t border-border/60 p-2 space-y-0.5">
        <Item to="/settings" icon={Settings} label={t("nav.settings")} collapsed={collapsed} />
      </div>

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

function isCurrentPath(loc: { pathname: string; search: string }, path: string): boolean {
  if (loc.pathname !== "/files") return false;
  const p = new URLSearchParams(loc.search).get("path");
  return p === path;
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
  // Skip rendering empty sections
  const arr = Array.isArray(children) ? children.flat().filter(Boolean) : [children];
  if (arr.length === 0) return null;
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

function PathButton({
  icon: Icon,
  iconClass,
  label,
  onClick,
  active,
  collapsed,
  muted,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconClass?: string;
  label: string;
  onClick: () => void;
  active?: boolean;
  collapsed?: boolean;
  muted?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg text-sm w-full transition-colors",
        collapsed ? "justify-center w-10 h-10 mx-auto" : "px-3 py-1.5",
        active
          ? "bg-accent text-accent-foreground font-medium"
          : muted
          ? "text-muted-foreground hover:bg-accent/40"
          : "text-sidebar-foreground/80 hover:bg-accent/60 hover:text-accent-foreground"
      )}
    >
      <Icon className={cn("w-4 h-4 shrink-0", iconClass)} />
      {!collapsed && <span className="truncate text-left flex-1">{label}</span>}
    </button>
  );
}

function DiskRow({
  disk,
  name,
  onClick,
  active,
  collapsed,
}: {
  disk: DiskInfo;
  name: string;
  onClick: () => void;
  active: boolean;
  collapsed: boolean;
}) {
  if (collapsed) {
    return (
      <button
        onClick={onClick}
        title={`${name} · ${formatBytes(disk.used)} / ${formatBytes(disk.total)}`}
        className={cn(
          "justify-center w-10 h-10 mx-auto flex items-center rounded-lg",
          active ? "bg-accent" : "hover:bg-accent/60"
        )}
      >
        <HardDrive className="w-4 h-4" />
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-1.5 rounded-lg transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "hover:bg-accent/60 hover:text-accent-foreground text-sidebar-foreground/80"
      )}
    >
      <div className="flex items-center gap-2.5">
        <HardDrive className="w-4 h-4 shrink-0" />
        <span className="truncate text-sm flex-1">{name}</span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {Math.round(disk.percent)}%
        </span>
      </div>
      <div className="ml-6 mt-1 h-1 rounded-full bg-secondary overflow-hidden">
        <div
          className={cn(
            "h-full transition-all",
            disk.percent > 90 ? "bg-rose-500" : disk.percent > 75 ? "bg-amber-500" : "bg-primary"
          )}
          style={{ width: `${Math.min(100, disk.percent)}%` }}
        />
      </div>
      <div className="ml-6 mt-0.5 text-[10px] text-muted-foreground">
        {formatBytes(disk.used)} / {formatBytes(disk.total)}
      </div>
    </button>
  );
}
