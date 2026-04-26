import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Monitor,
  Download,
  FileText,
  Image as ImageIcon,
  Folder,
  HardDrive,
  ChevronRight,
  Sparkles,
  Copy,
  FileSearch,
  Trash2,
  Tag as TagIcon,
  Activity as ActivityIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TopBar } from "@/components/layout/TopBar";
import { cn } from "@/lib/utils";
import * as api from "@/api";
import type { DiskInfo, RecentEntry, Tag, UserDir } from "@/api/types";
import { formatBytes, relativeTime } from "@/lib/format";
import { FileIcon } from "@/components/FileIcon";

const QUICK_ICON_BY_KIND: Record<string, { icon: any; color: string }> = {
  home: { icon: Folder, color: "from-slate-400 to-slate-500" },
  desktop: { icon: Monitor, color: "from-blue-400 to-blue-500" },
  download: { icon: Download, color: "from-emerald-400 to-emerald-500" },
  document: { icon: FileText, color: "from-violet-400 to-violet-500" },
  picture: { icon: ImageIcon, color: "from-rose-400 to-rose-500" },
  video: { icon: ImageIcon, color: "from-amber-400 to-amber-500" },
  audio: { icon: ImageIcon, color: "from-pink-400 to-pink-500" },
};

export default function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [recents, setRecents] = useState<RecentEntry[]>([]);
  const [disks, setDisks] = useState<DiskInfo[]>([]);
  const [userDirs, setUserDirs] = useState<UserDir[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  useEffect(() => {
    api.listRecents(8).then(setRecents).catch(() => {});
    api.listDisks().then(setDisks).catch(() => {});
    api.listUserDirs().then(setUserDirs).catch(() => {});
    api.listTags().then(setTags).catch(() => {});
  }, []);

  const totalUsed = disks.reduce((s, d) => s + d.used, 0);
  const totalAll = disks.reduce((s, d) => s + d.total, 0);
  const overall = totalAll > 0 ? Math.round((totalUsed / totalAll) * 100) : 0;

  const suggestions = [
    { icon: Sparkles, title: t("home.sug_organize"), to: "/automation", color: "from-blue-400/20 to-violet-400/20" },
    { icon: Copy, title: t("home.sug_duplicates"), to: "/duplicates", color: "from-emerald-400/20 to-cyan-400/20" },
    { icon: FileSearch, title: t("home.sug_extract"), to: "/preview", color: "from-amber-400/20 to-rose-400/20" },
    { icon: Trash2, title: t("home.sug_cleanup"), to: "/analyze", color: "from-rose-400/20 to-pink-400/20" },
  ];

  const hour = new Date().getHours();
  const greeting =
    hour < 6
      ? "凌晨好"
      : hour < 12
      ? t("home.greeting_morning").replace("，欢迎回来！", "")
      : hour < 18
      ? t("home.greeting_afternoon").replace("，欢迎回来！", "")
      : t("home.greeting_evening").replace("，欢迎回来！", "");

  return (
    <div className="flex-1 flex min-w-0">
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <div className="flex-1 overflow-y-auto scrollbar-thin p-6">
          {/* Greeting hero */}
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight">
              {greeting}，欢迎回来！ <span className="inline-block">👋</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("app.name")} · {t("app.tagline")}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-6">
            {/* Main column */}
            <div className="col-span-2 space-y-6">
              {/* Quick Access */}
              <section>
                <SectionHeader title={t("home.quick_access")} />
                <div className="grid grid-cols-6 gap-3">
                  {userDirs.slice(0, 6).map((d) => {
                    const meta = QUICK_ICON_BY_KIND[d.kind] || QUICK_ICON_BY_KIND.home;
                    const Icon = meta.icon;
                    return (
                      <button
                        key={d.path}
                        onClick={() => navigate(`/files?path=${encodeURIComponent(d.path)}`)}
                        className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-accent/40 transition-colors"
                      >
                        <div className={cn("w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-sm", meta.color)}>
                          <Icon className="w-6 h-6 text-white" />
                        </div>
                        <span className="text-xs truncate w-full text-center">{d.name}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Storage Overview */}
              <section>
                <SectionHeader title={t("home.storage_overview")} />
                <div className="grid grid-cols-4 gap-3">
                  {disks.slice(0, 4).map((d) => (
                    <Card key={d.mount_point} className="p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <HardDrive className="w-4 h-4 text-primary" />
                        <span className="text-xs font-medium truncate">
                          {d.name || d.mount_point}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${Math.min(100, d.percent)}%` }} />
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1.5">
                        {formatBytes(d.used)} / {formatBytes(d.total)}
                      </div>
                    </Card>
                  ))}
                  {disks.length === 0 &&
                    Array.from({ length: 4 }).map((_, i) => (
                      <Card key={i} className="p-3 h-[78px] animate-pulse bg-secondary/30" />
                    ))}
                </div>
              </section>

              {/* Recent Files */}
              <section>
                <SectionHeader
                  title={t("home.recent_files")}
                  action={
                    <button
                      onClick={() => navigate("/files")}
                      className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                    >
                      {t("home.view_all")} <ChevronRight className="w-3 h-3" />
                    </button>
                  }
                />
                {recents.length === 0 ? (
                  <Card className="p-6 text-center text-xs text-muted-foreground">
                    {t("home.no_recents")}
                  </Card>
                ) : (
                  <div className="grid grid-cols-4 gap-3">
                    {recents.slice(0, 4).map((f) => {
                      const ext = f.name.split(".").pop();
                      return (
                        <Card
                          key={f.path}
                          onClick={() => api.openPath(f.path).catch(() => {})}
                          className="p-0 cursor-pointer hover:shadow-md transition-shadow overflow-hidden"
                        >
                          <div className="aspect-[4/3] bg-gradient-to-br from-secondary/60 to-secondary/30 flex items-center justify-center">
                            <FileIcon
                              name={f.name}
                              path={f.path}
                              isDir={f.is_dir}
                              extension={ext}
                              size="lg"
                              thumbnail
                            />
                          </div>
                          <div className="p-2">
                            <div className="text-xs font-medium truncate">{f.name}</div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {relativeTime(f.accessed_at)}
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* AI Suggestions */}
              <section>
                <SectionHeader title={t("home.ai_suggestions")} />
                <div className="grid grid-cols-4 gap-3">
                  {suggestions.map((s) => (
                    <Card
                      key={s.title}
                      onClick={() => navigate(s.to)}
                      className="p-0 cursor-pointer hover:shadow-md transition-shadow overflow-hidden"
                    >
                      <div className={cn("aspect-[4/3] bg-gradient-to-br flex items-center justify-center", s.color)}>
                        <s.icon className="w-8 h-8 text-foreground/70" />
                      </div>
                      <div className="p-2">
                        <div className="text-xs font-medium truncate">{s.title}</div>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Storage Usage */}
              <Card>
                <CardHeader>
                  <CardTitle>{t("home.storage_usage")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-center py-2">
                    <StorageRing percent={overall} used={totalUsed} total={totalAll} />
                  </div>
                  <div className="space-y-2 mt-4 text-xs">
                    {disks.slice(0, 4).map((d) => (
                      <div key={d.mount_point} className="flex items-center gap-2">
                        <span className="flex-1 truncate text-muted-foreground">
                          {d.name || d.mount_point.split(/[\\/]/).pop() || d.mount_point}
                        </span>
                        <span>{Math.round(d.percent)}%</span>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-4"
                    onClick={() => navigate("/analyze")}
                  >
                    {t("home.manage_storage")}
                  </Button>
                </CardContent>
              </Card>

              {/* Tags */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TagIcon className="w-4 h-4" />
                    {t("home.tags")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {tags.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-2">
                      {t("home.no_tags")}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {tags.slice(0, 12).map((tg) => (
                        <span
                          key={tg.id}
                          onClick={() => navigate("/tags")}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] cursor-pointer hover:opacity-80"
                          style={{
                            backgroundColor: `${tg.color}22`,
                            color: tg.color,
                          }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: tg.color }}
                          />
                          {tg.name}
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Activity */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ActivityIcon className="w-4 h-4" />
                    {t("home.activity")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {recents.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-2">
                      {t("home.no_activity")}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {recents.slice(0, 4).map((r) => {
                        return (
                          <div key={r.path} className="flex items-start gap-2">
                            <div className="shrink-0">
                              <FileIcon
                                name={r.name}
                                isDir={r.is_dir}
                                size="sm"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs truncate">{r.name}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {relativeTime(r.accessed_at)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <button
                    onClick={() => navigate("/files")}
                    className="text-xs text-primary hover:underline mt-3 flex items-center gap-1"
                  >
                    {t("home.view_all_activity")} <ChevronRight className="w-3 h-3" />
                  </button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-medium">{title}</h2>
      {action}
    </div>
  );
}

function StorageRing({
  percent,
  used,
  total,
}: {
  percent: number;
  used: number;
  total: number;
}) {
  // Ring geometry: 80×80 viewBox, stroke 8 → outer r=36, inner r=28.
  // Text lives inside the inner radius (~70 % of width) so it never
  // crosses the stroke even with long byte counts like "456 GB / 500 GB".
  const r = 36;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;
  const ringColor =
    percent > 90
      ? "hsl(346 77% 55%)"
      : percent > 75
      ? "hsl(38 92% 50%)"
      : "hsl(var(--primary))";

  return (
    <div className="relative w-36 h-36 mx-auto">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} stroke="hsl(var(--border))" strokeWidth="8" fill="none" />
        <circle
          cx="40"
          cy="40"
          r={r}
          stroke={ringColor}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
        <div className="text-xl font-semibold leading-none tabular-nums">{percent}%</div>
        <div className="mt-1 text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
          {formatBytes(used)}
        </div>
        <div className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
          / {formatBytes(total)}
        </div>
      </div>
    </div>
  );
}
