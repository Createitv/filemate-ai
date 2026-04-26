import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Sparkles,
  Wand2,
  History,
  Eye,
  FileText,
  Folder,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TopBar } from "@/components/layout/TopBar";
import { AIPanel } from "@/components/layout/AIPanel";
import * as api from "@/api";
import type { DiskInfo, RecentEntry, Workspace } from "@/api/types";
import { formatBytes, relativeTime } from "@/lib/format";
import { fileIconColor } from "@/lib/format";

export default function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? t("home.greeting_morning") : hour < 18 ? t("home.greeting_afternoon") : t("home.greeting_evening");

  const [recents, setRecents] = useState<RecentEntry[]>([]);
  const [disks, setDisks] = useState<DiskInfo[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  useEffect(() => {
    api.listRecents(10).then(setRecents).catch(() => {});
    api.listDisks().then(setDisks).catch(() => {});
    api.listWorkspaces().then(setWorkspaces).catch(() => {});
  }, []);

  const aiCards = [
    { icon: Sparkles, title: t("home.ai_search"), desc: t("home.ai_search_desc"), to: "/search", color: "from-blue-500 to-cyan-500" },
    { icon: Wand2, title: t("home.auto_tidy"), desc: t("home.auto_tidy_desc"), to: "/automation", color: "from-violet-500 to-fuchsia-500" },
    { icon: History, title: t("home.version_history"), desc: t("home.version_history_desc"), to: "/files", color: "from-emerald-500 to-teal-500" },
    { icon: Eye, title: t("home.preview"), desc: t("home.preview_desc"), to: "/preview", color: "from-amber-500 to-orange-500" },
  ];

  const primary = disks[0];
  const totalUsed = disks.reduce((s, d) => s + d.used, 0);
  const totalAll = disks.reduce((s, d) => s + d.total, 0);
  const overall = totalAll > 0 ? Math.round((totalUsed / totalAll) * 100) : 0;

  return (
    <div className="flex-1 flex min-w-0">
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{greeting}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("home.subtitle")}</p>
          </div>

          <div>
            <div className="text-sm font-medium text-muted-foreground mb-3">{t("home.ai_quick")}</div>
            <div className="grid grid-cols-4 gap-4">
              {aiCards.map((c) => (
                <Card
                  key={c.title}
                  className="p-4 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => navigate(c.to)}
                >
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${c.color} flex items-center justify-center mb-3`}>
                    <c.icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="font-medium text-sm">{c.title}</div>
                  <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{c.desc}</div>
                </Card>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Card className="col-span-2">
              <CardHeader>
                <CardTitle>{t("home.recent_files")}</CardTitle>
                <button
                  onClick={() => navigate("/files")}
                  className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                >
                  {t("home.view_all")} <ChevronRight className="w-3 h-3" />
                </button>
              </CardHeader>
              <CardContent className="space-y-1">
                {recents.length === 0 && (
                  <div className="text-xs text-muted-foreground py-6 text-center">
                    暂无记录，使用应用后会出现在这里
                  </div>
                )}
                {recents.map((f) => {
                  const ext = f.name.split(".").pop();
                  const Icon = f.is_dir ? Folder : FileText;
                  const color = f.is_dir ? "text-blue-500" : fileIconColor(ext);
                  return (
                    <div
                      key={f.path}
                      onClick={() => api.openPath(f.path)}
                      className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-accent/60 cursor-pointer"
                    >
                      <Icon className={`w-4 h-4 ${color}`} />
                      <div className="flex-1 text-sm truncate">{f.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {relativeTime(f.accessed_at)}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("home.storage")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center py-2">
                  <StorageRing
                    percent={overall}
                    used={primary ? primary.used : totalUsed}
                    total={primary ? primary.total : totalAll}
                  />
                </div>
                <div className="space-y-2 mt-2 text-xs">
                  {disks.slice(0, 4).map((d) => (
                    <Bar
                      key={d.mount_point}
                      label={d.mount_point.split(/[\\/]/).pop() || d.mount_point}
                      value={Math.round(d.percent)}
                      color="bg-primary"
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <div className="text-sm font-medium text-muted-foreground mb-3">{t("home.shortcuts")}</div>
            <div className="grid grid-cols-3 gap-4">
              {workspaces.length === 0 && (
                <Card className="col-span-3 p-6 text-center text-sm text-muted-foreground">
                  暂无工作区，去 <button onClick={() => navigate("/workspace")} className="text-primary">工作区</button> 创建一个
                </Card>
              )}
              {workspaces.slice(0, 3).map((w) => (
                <Card key={w.id} className="p-5 cursor-pointer hover:shadow-md transition-shadow bg-gradient-to-br from-primary/15 to-primary/5">
                  <Folder className="w-6 h-6 text-foreground/70 mb-3" />
                  <div className="font-medium">{w.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    最近更新 {relativeTime(w.updated_at)}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
      <AIPanel />
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
  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (percent / 100) * circumference;
  return (
    <div className="relative w-28 h-28">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r="36" stroke="hsl(var(--border))" strokeWidth="6" fill="none" />
        <circle
          cx="40"
          cy="40"
          r="36"
          stroke="hsl(var(--primary))"
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-2xl font-semibold">{percent}%</div>
        <div className="text-[10px] text-muted-foreground">
          {formatBytes(used)} / {formatBytes(total)}
        </div>
      </div>
    </div>
  );
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 text-muted-foreground truncate">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="w-8 text-right text-muted-foreground">{value}%</span>
    </div>
  );
}
