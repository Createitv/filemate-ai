import { useEffect, useState } from "react";
import { Sparkles, FolderOpen, Loader2, BarChart3, Calendar, AlertCircle, Files } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import * as api from "@/api";
import type { AIProvider, FolderStats } from "@/api/types";
import { toast, toastError } from "@/components/ui/toast";
import { formatBytes, formatTime } from "@/lib/format";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useNavigate } from "react-router-dom";
import { Select } from "@/components/ui/select";
import { Bot } from "lucide-react";

export default function Analyze() {
  const navigate = useNavigate();
  const [path, setPath] = useState("");
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [providerId, setProviderId] = useState<string>("");
  const [stats, setStats] = useState<FolderStats | null>(null);
  const [advice, setAdvice] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"idle" | "scanning" | "thinking">("idle");

  useEffect(() => {
    api
      .aiProviderList()
      .then((list) => {
        setProviders(list);
        const active = list.find((p) => p.is_active) || list[0];
        if (active) setProviderId(active.id);
      })
      .catch(toastError);
  }, []);

  useEffect(() => {
    let unlisten: any;
    api.onAiChunk((p) => {
      setAdvice((prev) => prev + p.delta);
    }).then((u) => (unlisten = u));
    return () => unlisten?.();
  }, []);

  const pick = async () => {
    const p = await openDialog({ directory: true, multiple: false });
    if (p) setPath(String(p));
  };

  const run = async () => {
    if (!path) {
      toast("先选择目录", "error");
      return;
    }
    if (!providerId) {
      toast("先在「AI 模型」配置一个模型", "error");
      navigate("/ai-providers");
      return;
    }
    setStats(null);
    setAdvice("");
    setPhase("scanning");
    setBusy(true);
    try {
      const sum = await api.analyzeFolderSummary(path);
      setStats(sum);
      setPhase("thinking");
      const result = await api.analyzeFolder(path, providerId);
      setAdvice(result.advice);
      setPhase("idle");
    } catch (e) {
      toastError(e);
      setPhase("idle");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <TopBar title="智能分析" />
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Input value={path} placeholder="选择要分析的目录" readOnly className="flex-1" />
            <Button variant="outline" onClick={pick}>
              <FolderOpen className="w-4 h-4" /> 选择
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">使用模型</span>
            <Select
              className="flex-1"
              value={providerId}
              onChange={setProviderId}
              searchable={providers.length > 6}
              placeholder={
                providers.length === 0 ? "请先在「AI 模型」中添加…" : "选择模型"
              }
              options={providers.map((p) => ({
                value: p.id,
                label: p.name,
                description: `${p.kind} · ${p.model}`,
                icon: (
                  <span className="w-6 h-6 rounded-md bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                    <Bot className="w-3.5 h-3.5 text-primary-foreground" />
                  </span>
                ),
                badge: p.is_active ? "默认" : undefined,
              }))}
            />
            <Button onClick={run} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              开始分析
            </Button>
          </div>
          {phase !== "idle" && (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {phase === "scanning" ? "正在扫描目录…" : "AI 正在分析数据…"}
            </div>
          )}
        </Card>

        {stats && (
          <div className="grid grid-cols-3 gap-4">
            <StatCard icon={Files} label="文件数" value={stats.total_files.toLocaleString()} />
            <StatCard
              icon={BarChart3}
              label="总大小"
              value={formatBytes(stats.total_bytes)}
            />
            <StatCard
              icon={AlertCircle}
              label="异常命名 / 疑似重复"
              value={`${stats.naming_anomalies.length} / ${stats.potential_dupes}`}
            />
          </div>
        )}

        {stats && (
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-5">
              <div className="font-medium mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" /> 按扩展名分布
              </div>
              <div className="space-y-2 text-sm">
                {stats.by_extension.slice(0, 12).map(([ext, count, bytes]) => {
                  const max = stats.by_extension[0]?.[2] || 1;
                  const w = (bytes / max) * 100;
                  return (
                    <div key={ext} className="flex items-center gap-2">
                      <span className="w-16 text-muted-foreground font-mono text-xs">.{ext}</span>
                      <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${w}%` }} />
                      </div>
                      <span className="text-xs w-20 text-right text-muted-foreground">
                        {count} · {formatBytes(bytes)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="p-5">
              <div className="font-medium mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" /> 最近修改
              </div>
              <div className="space-y-1 text-sm">
                {stats.recently_modified.slice(0, 8).map((f) => (
                  <div key={f.path} className="flex items-center gap-2 px-1 py-1">
                    <span className="flex-1 truncate">{f.name}</span>
                    <span className="text-xs text-muted-foreground">{formatTime(f.modified)}</span>
                  </div>
                ))}
                {stats.recently_modified.length === 0 && (
                  <div className="text-xs text-muted-foreground py-2">最近一周无修改</div>
                )}
              </div>
            </Card>

            <Card className="p-5">
              <div className="font-medium mb-3">最大文件</div>
              <div className="space-y-1 text-sm">
                {stats.biggest.slice(0, 8).map((f) => (
                  <div key={f.path} className="flex items-center gap-2">
                    <span className="flex-1 truncate">{f.name}</span>
                    <span className="text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <div className="font-medium mb-3">命名异常样本</div>
              <div className="space-y-1 text-sm max-h-48 overflow-y-auto">
                {stats.naming_anomalies.slice(0, 12).map((n, i) => (
                  <div key={i} className="text-xs text-muted-foreground truncate">
                    {n}
                  </div>
                ))}
                {stats.naming_anomalies.length === 0 && (
                  <div className="text-xs text-muted-foreground">未检出明显异常 ✓</div>
                )}
              </div>
            </Card>
          </div>
        )}

        {(advice || phase === "thinking") && (
          <Card className="p-6 bg-gradient-to-br from-primary/5 to-transparent border-primary/30">
            <div className="font-medium mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" /> AI 整理建议
            </div>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              {advice ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{advice}</ReactMarkdown>
              ) : (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> 等待模型回复…
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Card className="p-5 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold">{value}</div>
      </div>
    </Card>
  );
}
