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
  Trash2,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", icon: Home, key: "nav.home", end: true },
  { to: "/files", icon: Folder, key: "nav.files" },
  { to: "/favorites", icon: Star, key: "nav.favorites" },
  { to: "/search", icon: Search, key: "nav.search" },
  { to: "/workspace", icon: LayoutGrid, key: "nav.workspace" },
  { to: "/ai", icon: Sparkles, key: "nav.ai" },
  { to: "/tags", icon: Tags, key: "nav.tags" },
];

const toolItems = [
  { to: "/automation", icon: Wand2, key: "nav.automation" },
  { to: "/preview", icon: Eye, key: "nav.preview" },
];

const cloudItems = [
  { to: "/cloud/onedrive", icon: Cloud, key: "cloud.onedrive" },
  { to: "/cloud/gdrive", icon: Cloud, key: "cloud.gdrive" },
];

export function Sidebar() {
  const { t } = useTranslation();
  return (
    <aside className="w-56 shrink-0 bg-sidebar text-sidebar-foreground border-r border-border/60 flex flex-col">
      <div className="px-4 py-4 flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold tracking-tight">{t("app.name")}</span>
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-4 space-y-4">
        <Group>
          {navItems.map((it) => (
            <NavItem key={it.to} {...it} label={t(it.key)} />
          ))}
        </Group>

        <Section label="工具">
          {toolItems.map((it) => (
            <NavItem key={it.to} {...it} label={t(it.key)} />
          ))}
        </Section>

        <Section label={t("cloud.title")}>
          {cloudItems.map((it) => (
            <NavItem key={it.to} {...it} label={t(it.key)} />
          ))}
        </Section>

        <div className="border-t border-border/60 pt-3">
          <NavItem to="/trash" icon={Trash2} label={t("nav.trash")} />
          <NavItem to="/settings" icon={Settings} label={t("nav.settings")} />
        </div>
      </nav>
    </aside>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-3 mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return <div className="space-y-0.5">{children}</div>;
}

function NavItem({
  to,
  icon: Icon,
  label,
  end,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
          isActive
            ? "bg-accent text-accent-foreground font-medium"
            : "text-sidebar-foreground/80 hover:bg-accent/60 hover:text-accent-foreground"
        )
      }
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
    </NavLink>
  );
}
