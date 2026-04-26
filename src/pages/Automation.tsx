import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Wand2, Play, Loader2 } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import * as api from "@/api";
import type { Rule, RuleRecord } from "@/api/types";
import { toast, toastError } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/format";
import { Select } from "@/components/ui/select";

const newRule = (): Rule => ({
  id: crypto.randomUUID(),
  name: "新规则",
  enabled: true,
  trigger: { type: "fs_event", folder: "" },
  conditions: [],
  actions: [],
});

const TEMPLATES: { name: string; build: () => Rule }[] = [
  {
    name: "下载清理",
    build: () => ({
      id: crypto.randomUUID(),
      name: "下载清理",
      enabled: true,
      trigger: { type: "fs_event", folder: "" },
      conditions: [{ type: "ext_in", values: ["pdf", "docx", "xlsx", "pptx"] }],
      actions: [{ type: "move", to: "" }, { type: "tag", name: "归档" }],
    }),
  },
  {
    name: "大文件提醒",
    build: () => ({
      id: crypto.randomUUID(),
      name: "大文件提醒",
      enabled: true,
      trigger: { type: "fs_event", folder: "" },
      conditions: [{ type: "size_gt", bytes: 1_000_000_000 }],
      actions: [{ type: "tag", name: "大文件" }],
    }),
  },
  {
    name: "旧文件归档",
    build: () => ({
      id: crypto.randomUUID(),
      name: "旧文件归档",
      enabled: true,
      trigger: { type: "manual" },
      conditions: [{ type: "older_than_days", days: 180 }],
      actions: [{ type: "move", to: "" }],
    }),
  },
];

export default function Automation() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"rules" | "templates" | "history">("rules");
  const [rules, setRules] = useState<RuleRecord[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [editing, setEditing] = useState<Rule>(newRule());
  const [busy, setBusy] = useState(false);

  const load = () => api.listRules().then(setRules).catch(toastError);
  const loadHistory = () => api.listAutomationHistory(50).then(setHistory).catch(() => {});
  useEffect(() => {
    load();
    loadHistory();
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      await api.saveRule(editing);
      toast("规则已保存", "success");
      load();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    setBusy(true);
    try {
      const n = await api.runRule(editing.id);
      toast(`已处理 ${n} 个文件`, "success");
      loadHistory();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    await api.deleteRule(id).catch(toastError);
    load();
  };

  const pickFolder = async (cb: (p: string) => void) => {
    const r = await openDialog({ directory: true, multiple: false });
    if (r) cb(String(r));
  };

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
                tab === k ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t(`automation.tabs.${k}`)}
            </button>
          ))}
          <div className="flex-1" />
          {tab === "rules" && (
            <Button size="sm" variant="outline" onClick={() => setEditing(newRule())}>
              <Plus className="w-3.5 h-3.5" /> 新规则
            </Button>
          )}
        </div>

        {tab === "rules" && (
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            <Card className="p-4 flex items-center gap-3">
              <Input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className="flex-1 font-medium"
              />
              <Toggle
                on={editing.enabled}
                onChange={(v) => setEditing({ ...editing, enabled: v })}
                label="启用"
              />
            </Card>

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
                <SelectField
                  label="触发"
                  value={editing.trigger?.type || "fs_event"}
                  options={[
                    ["fs_event", "目录有文件变化"],
                    ["manual", "手动运行"],
                  ]}
                  onChange={(v) => setEditing({ ...editing, trigger: { ...editing.trigger, type: v } })}
                />
                {editing.trigger?.type === "fs_event" && (
                  <Row label="监听目录">
                    <Input
                      className="flex-1"
                      value={editing.trigger?.folder || ""}
                      onChange={(e) =>
                        setEditing({ ...editing, trigger: { ...editing.trigger, folder: e.target.value } })
                      }
                    />
                    <Button variant="outline" size="sm" onClick={() => pickFolder((p) => setEditing({ ...editing, trigger: { ...editing.trigger, folder: p } }))}>
                      选择
                    </Button>
                  </Row>
                )}
                {editing.conditions.map((c, i) => (
                  <ConditionRow
                    key={i}
                    cond={c}
                    onChange={(c) => {
                      const next = [...editing.conditions];
                      next[i] = c;
                      setEditing({ ...editing, conditions: next });
                    }}
                    onRemove={() =>
                      setEditing({
                        ...editing,
                        conditions: editing.conditions.filter((_, j) => j !== i),
                      })
                    }
                  />
                ))}
                <button
                  className="text-sm text-primary flex items-center gap-1.5 mt-2"
                  onClick={() =>
                    setEditing({
                      ...editing,
                      conditions: [...editing.conditions, { type: "ext_in", values: [] }],
                    })
                  }
                >
                  <Plus className="w-3.5 h-3.5" /> 添加条件
                </button>
              </CardContent>
            </Card>

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
                {editing.actions.map((a, i) => (
                  <ActionRow
                    key={i}
                    action={a}
                    onPickFolder={pickFolder}
                    onChange={(a) => {
                      const next = [...editing.actions];
                      next[i] = a;
                      setEditing({ ...editing, actions: next });
                    }}
                    onRemove={() =>
                      setEditing({
                        ...editing,
                        actions: editing.actions.filter((_, j) => j !== i),
                      })
                    }
                  />
                ))}
                <button
                  className="text-sm text-primary flex items-center gap-1.5 mt-2"
                  onClick={() =>
                    setEditing({ ...editing, actions: [...editing.actions, { type: "move", to: "" }] })
                  }
                >
                  <Plus className="w-3.5 h-3.5" /> 添加动作
                </button>
              </CardContent>
            </Card>

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={run} disabled={busy}>
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                {t("automation.test_run")}
              </Button>
              <Button onClick={save} disabled={busy}>
                {t("automation.save")}
              </Button>
            </div>

            <div>
              <div className="text-sm font-medium text-muted-foreground mb-2">已有规则</div>
              <div className="grid grid-cols-2 gap-3">
                {rules.map((r) => (
                  <Card key={r.id} className="p-4 group">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="font-medium truncate">{r.name}</div>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                              r.enabled
                                ? "bg-emerald-500/10 text-emerald-600"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {r.enabled ? "启用" : "停用"}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {r.conditions.length} 条件 · {r.actions.length} 动作
                        </div>
                      </div>
                      <button
                        onClick={() => setEditing(r)}
                        className="text-xs text-primary"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => remove(r.id)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "templates" && (
          <div className="flex-1 overflow-y-auto p-6 grid grid-cols-3 gap-4">
            {TEMPLATES.map((tpl) => (
              <Card key={tpl.name} className="p-5 cursor-pointer hover:shadow-md" onClick={() => setEditing(tpl.build())}>
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center mb-3">
                  <Wand2 className="w-4 h-4 text-white" />
                </div>
                <div className="font-medium">{tpl.name}</div>
                <div className="text-xs text-muted-foreground mt-1">点击载入到编辑器</div>
              </Card>
            ))}
          </div>
        )}

        {tab === "history" && (
          <div className="flex-1 overflow-y-auto p-6 space-y-2">
            {history.map((h, i) => (
              <Card key={i} className="p-3 flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium">{h.rule_name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    影响 {h.affected} 项 · {h.detail}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">{relativeTime(h.occurred_at)}</div>
              </Card>
            ))}
            {history.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-12">
                还没有执行记录
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/30 px-3 py-2.5">
      <span className="text-sm text-muted-foreground w-24 shrink-0">{label}</span>
      {children}
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <Row label={label}>
      <Select
        className="flex-1"
        value={value}
        onChange={onChange}
        options={options.map(([v, l]) => ({ value: v, label: l }))}
      />
    </Row>
  );
}

function ConditionRow({
  cond,
  onChange,
  onRemove,
}: {
  cond: any;
  onChange: (c: any) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/30 px-3 py-2.5">
      <Select
        className="w-44"
        value={cond.type}
        onChange={(v) => onChange({ type: v, ...defaultsForCondition(v) })}
        options={[
          { value: "ext_in", label: "扩展名属于" },
          { value: "name_contains", label: "文件名包含" },
          { value: "size_gt", label: "大小 大于" },
          { value: "size_lt", label: "大小 小于" },
          { value: "older_than_days", label: "最近未访问 超过" },
        ]}
      />
      {cond.type === "ext_in" && (
        <Input
          className="flex-1"
          value={(cond.values || []).join(",")}
          onChange={(e) =>
            onChange({ ...cond, values: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })
          }
          placeholder="pdf,docx,xlsx"
        />
      )}
      {cond.type === "name_contains" && (
        <Input
          className="flex-1"
          value={cond.value || ""}
          onChange={(e) => onChange({ ...cond, value: e.target.value })}
        />
      )}
      {(cond.type === "size_gt" || cond.type === "size_lt") && (
        <Input
          className="flex-1"
          type="number"
          value={cond.bytes || 0}
          onChange={(e) => onChange({ ...cond, bytes: Number(e.target.value) })}
          placeholder="字节"
        />
      )}
      {cond.type === "older_than_days" && (
        <Input
          className="flex-1"
          type="number"
          value={cond.days || 30}
          onChange={(e) => onChange({ ...cond, days: Number(e.target.value) })}
          placeholder="天数"
        />
      )}
      <button onClick={onRemove} className="text-muted-foreground hover:text-rose-500">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function ActionRow({
  action,
  onChange,
  onRemove,
  onPickFolder,
}: {
  action: any;
  onChange: (a: any) => void;
  onRemove: () => void;
  onPickFolder: (cb: (p: string) => void) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/30 px-3 py-2.5">
      <Select
        className="w-36"
        value={action.type}
        onChange={(v) => onChange({ type: v, ...defaultsForAction(v) })}
        options={[
          { value: "move", label: "移动到" },
          { value: "copy", label: "复制到" },
          { value: "rename", label: "重命名为" },
          { value: "tag", label: "添加标签" },
          { value: "delete", label: "删除" },
          { value: "shell", label: "执行命令" },
        ]}
      />
      {(action.type === "move" || action.type === "copy") && (
        <>
          <Input
            className="flex-1"
            value={action.to || ""}
            onChange={(e) => onChange({ ...action, to: e.target.value })}
            placeholder="目标目录"
          />
          <Button variant="outline" size="sm" onClick={() => onPickFolder((p) => onChange({ ...action, to: p }))}>
            选择
          </Button>
        </>
      )}
      {action.type === "rename" && (
        <Input
          className="flex-1"
          value={action.template || ""}
          onChange={(e) => onChange({ ...action, template: e.target.value })}
          placeholder="{date}_{name}"
        />
      )}
      {action.type === "tag" && (
        <Input
          className="flex-1"
          value={action.name || ""}
          onChange={(e) => onChange({ ...action, name: e.target.value })}
          placeholder="标签名"
        />
      )}
      {action.type === "shell" && (
        <Input
          className="flex-1"
          value={action.cmd || ""}
          onChange={(e) => onChange({ ...action, cmd: e.target.value })}
          placeholder="echo $PATH"
        />
      )}
      {action.type === "delete" && <span className="flex-1 text-xs text-muted-foreground">移到回收站</span>}
      <button onClick={onRemove} className="text-muted-foreground hover:text-rose-500">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function defaultsForCondition(type: string): any {
  switch (type) {
    case "ext_in":
      return { values: [] };
    case "name_contains":
      return { value: "" };
    case "size_gt":
    case "size_lt":
      return { bytes: 1_000_000 };
    case "older_than_days":
      return { days: 30 };
    default:
      return {};
  }
}
function defaultsForAction(type: string): any {
  switch (type) {
    case "move":
    case "copy":
      return { to: "" };
    case "rename":
      return { template: "{date}_{name}" };
    case "tag":
      return { name: "" };
    case "shell":
      return { cmd: "" };
    default:
      return {};
  }
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border",
        on ? "border-primary/30 bg-primary/5" : "border-border bg-secondary/40"
      )}
    >
      <span className={cn("w-8 h-4 rounded-full relative transition-colors", on ? "bg-primary" : "bg-muted-foreground/30")}>
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
