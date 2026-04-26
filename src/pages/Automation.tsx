import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Folder,
  FileType,
  HardDrive,
  Plus,
  Trash2,
  Wand2,
  Sparkles,
  ChevronRight,
  Play,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default function Automation() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"rules" | "templates" | "history">("rules");
  const [enabled, setEnabled] = useState(true);

  return (
    <div className="flex-1 flex min-w-0">
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar title={t("automation.title")} />

        <div className="px-6 py-3 border-b border-border/60 flex items-center gap-2">
          {(["rules", "templates", "history"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-lg",
                tab === k
                  ? "bg-secondary font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t(`automation.tabs.${k}`)}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-5">
          {/* Rule header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-lg">{t("automation.rule_name")}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">规则将在文件进入下载文件夹时自动执行</p>
            </div>
            <div className="flex items-center gap-3">
              <Toggle on={enabled} onChange={setEnabled} label={t("automation.enabled")} />
            </div>
          </div>

          {/* If block */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-primary text-primary-foreground text-xs font-medium">
                  {t("automation.if")}
                </span>
                <CardTitle>{t("automation.trigger")}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Condition icon={Folder} label={t("automation.monitor_folder")} value="C:\\Users\\Ling\\Downloads" />
              <Condition icon={FileType} label={t("automation.file_type")} value="pdf, docx, xlsx, pptx" />
              <Condition icon={HardDrive} label={t("automation.file_size")} value="< 100 MB" />
              <button className="text-sm text-primary flex items-center gap-1.5 mt-2">
                <Plus className="w-3.5 h-3.5" /> 添加条件
              </button>
            </CardContent>
          </Card>

          {/* Then block */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-emerald-500 text-white text-xs font-medium">
                  {t("automation.then")}
                </span>
                <CardTitle>{t("automation.action")}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Condition icon={Folder} label={t("automation.move_to")} value="D:\\工作文件\\归档" />
              <Condition icon={FileType} label={t("automation.rename_with")} value="{date}_{name}" />
              <Condition icon={Sparkles} label={t("automation.add_tag")} value="自动归档" />
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline">
              <Play className="w-3.5 h-3.5" /> {t("automation.test_run")}
            </Button>
            <Button>
              {t("automation.save")}
            </Button>
          </div>
        </div>
      </div>

      {/* Right panel: templates + history */}
      <aside className="w-80 shrink-0 border-l border-border/60 overflow-y-auto scrollbar-thin p-5 space-y-5 bg-gradient-to-b from-accent/30 to-background">
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="font-medium">{t("automation.templates_title")}</span>
            <button className="text-xs text-primary flex items-center">
              查看更多 <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-2">
            {[
              { icon: Wand2, name: "照片自动归档", color: "from-rose-500 to-pink-500" },
              { icon: Wand2, name: "下载清理", color: "from-blue-500 to-cyan-500" },
              { icon: Wand2, name: "大文件提醒", color: "from-amber-500 to-orange-500" },
              { icon: Wand2, name: "旧文件归档", color: "from-emerald-500 to-teal-500" },
            ].map((tpl) => (
              <Card key={tpl.name} className="p-3 flex items-center gap-3 cursor-pointer hover:shadow-md transition">
                <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${tpl.color} flex items-center justify-center`}>
                  <tpl.icon className="w-4 h-4 text-white" />
                </div>
                <div className="text-sm font-medium">{tpl.name}</div>
              </Card>
            ))}
          </div>
        </div>

        <div>
          <div className="font-medium mb-3">{t("automation.history_title")}</div>
          <div className="space-y-2 text-xs">
            {[
              { name: "下载清理", time: "10 分钟前", count: "整理 23 个文件" },
              { name: "照片归档", time: "今天 09:30", count: "整理 156 张照片" },
              { name: "大文件提醒", time: "昨天 18:00", count: "标记 4 个文件" },
            ].map((h) => (
              <div key={h.time} className="flex items-center justify-between rounded-lg bg-card border border-border/60 p-2.5">
                <div>
                  <div className="text-sm">{h.name}</div>
                  <div className="text-muted-foreground mt-0.5">{h.count}</div>
                </div>
                <div className="text-muted-foreground">{h.time}</div>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

function Condition({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/30 px-3 py-2.5">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <span className="text-sm text-muted-foreground w-24 shrink-0">{label}</span>
      <Input className="flex-1 bg-background" defaultValue={value} />
      <button className="p-1.5 text-muted-foreground hover:text-rose-500">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border",
        on ? "border-primary/30 bg-primary/5" : "border-border bg-secondary/40"
      )}
    >
      <span
        className={cn(
          "w-8 h-4 rounded-full relative transition-colors",
          on ? "bg-primary" : "bg-muted-foreground/30"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all",
            on ? "left-4" : "left-0.5"
          )}
        />
      </span>
      {label}
    </button>
  );
}
