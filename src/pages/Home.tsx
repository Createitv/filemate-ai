import { useTranslation } from "react-i18next";
import {
  Sparkles,
  Wand2,
  History,
  Eye,
  FileText,
  Image as ImageIcon,
  FileVideo,
  Code2,
  Folder,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TopBar } from "@/components/layout/TopBar";
import { AIPanel } from "@/components/layout/AIPanel";

export default function Home() {
  const { t } = useTranslation();
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? t("home.greeting_morning") : hour < 18 ? t("home.greeting_afternoon") : t("home.greeting_evening");

  const aiCards = [
    { icon: Sparkles, title: t("home.ai_search"), desc: t("home.ai_search_desc"), color: "from-blue-500 to-cyan-500" },
    { icon: Wand2, title: t("home.auto_tidy"), desc: t("home.auto_tidy_desc"), color: "from-violet-500 to-fuchsia-500" },
    { icon: History, title: t("home.version_history"), desc: t("home.version_history_desc"), color: "from-emerald-500 to-teal-500" },
    { icon: Eye, title: t("home.preview"), desc: t("home.preview_desc"), color: "from-amber-500 to-orange-500" },
  ];

  const recent = [
    { name: "产品需求文档 v2.0.docx", icon: FileText, color: "text-blue-500", time: "5 分钟前" },
    { name: "团队照片合集.zip", icon: ImageIcon, color: "text-rose-500", time: "1 小时前" },
    { name: "演示录屏.mp4", icon: FileVideo, color: "text-violet-500", time: "今天 09:30" },
    { name: "main.rs", icon: Code2, color: "text-emerald-500", time: "昨天" },
    { name: "Q4 营收分析.xlsx", icon: FileText, color: "text-green-500", time: "昨天" },
  ];

  const workspaces = [
    { name: t("home.ws_dev"), files: 1240, color: "bg-gradient-to-br from-blue-500/20 to-blue-500/5" },
    { name: t("home.ws_design"), files: 856, color: "bg-gradient-to-br from-rose-500/20 to-rose-500/5" },
    { name: t("home.ws_docs"), files: 432, color: "bg-gradient-to-br from-emerald-500/20 to-emerald-500/5" },
  ];

  return (
    <div className="flex-1 flex min-w-0">
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{greeting}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("home.subtitle")}</p>
          </div>

          {/* AI quick cards */}
          <div>
            <div className="text-sm font-medium text-muted-foreground mb-3">{t("home.ai_quick")}</div>
            <div className="grid grid-cols-4 gap-4">
              {aiCards.map((c) => (
                <Card
                  key={c.title}
                  className="p-4 cursor-pointer hover:shadow-md transition-shadow group"
                >
                  <div
                    className={`w-10 h-10 rounded-xl bg-gradient-to-br ${c.color} flex items-center justify-center mb-3`}
                  >
                    <c.icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="font-medium text-sm">{c.title}</div>
                  <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{c.desc}</div>
                </Card>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {/* Recent files */}
            <Card className="col-span-2">
              <CardHeader>
                <CardTitle>{t("home.recent_files")}</CardTitle>
                <button className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
                  {t("home.view_all")} <ChevronRight className="w-3 h-3" />
                </button>
              </CardHeader>
              <CardContent className="space-y-1">
                {recent.map((f) => (
                  <div
                    key={f.name}
                    className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-accent/60 cursor-pointer"
                  >
                    <f.icon className={`w-4 h-4 ${f.color}`} />
                    <div className="flex-1 text-sm truncate">{f.name}</div>
                    <div className="text-xs text-muted-foreground">{f.time}</div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Storage */}
            <Card>
              <CardHeader>
                <CardTitle>{t("home.storage")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center py-2">
                  <StorageRing percent={64} />
                </div>
                <div className="space-y-2 mt-2 text-xs">
                  <Bar label="文档" value={28} color="bg-blue-500" />
                  <Bar label="图片" value={42} color="bg-rose-500" />
                  <Bar label="视频" value={18} color="bg-violet-500" />
                  <Bar label="其他" value={12} color="bg-emerald-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Workspaces */}
          <div>
            <div className="text-sm font-medium text-muted-foreground mb-3">{t("home.shortcuts")}</div>
            <div className="grid grid-cols-3 gap-4">
              {workspaces.map((w) => (
                <Card key={w.name} className={`p-5 cursor-pointer hover:shadow-md transition-shadow ${w.color}`}>
                  <Folder className="w-6 h-6 text-foreground/70 mb-3" />
                  <div className="font-medium">{w.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">{w.files} 个文件</div>
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

function StorageRing({ percent }: { percent: number }) {
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
        <div className="text-[10px] text-muted-foreground">320 / 500 GB</div>
      </div>
    </div>
  );
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 text-muted-foreground">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="w-8 text-right text-muted-foreground">{value}%</span>
    </div>
  );
}
