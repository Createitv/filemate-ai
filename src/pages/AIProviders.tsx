import { useEffect, useMemo, useState } from "react";
import { Sparkles, Plus, Trash2, Check, Loader2, Eye, EyeOff } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as api from "@/api";
import type { AIProvider, AIProviderKind } from "@/api/types";
import { toast, toastError } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface Preset {
  id: string;
  label: string;
  kind: AIProviderKind;
  base_url: string;
  model: string;
  hint?: string;
  needs_key: boolean;
}

const PRESETS: Preset[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    kind: "openai",
    base_url: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    hint: "在 platform.deepseek.com 创建 API Key",
    needs_key: true,
  },
  {
    id: "openai",
    label: "OpenAI",
    kind: "openai",
    base_url: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    hint: "OpenAI Platform → API keys",
    needs_key: true,
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    kind: "anthropic",
    base_url: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-5",
    hint: "console.anthropic.com",
    needs_key: true,
  },
  {
    id: "moonshot",
    label: "Moonshot Kimi",
    kind: "openai",
    base_url: "https://api.moonshot.cn/v1",
    model: "moonshot-v1-8k",
    hint: "platform.moonshot.cn",
    needs_key: true,
  },
  {
    id: "qwen",
    label: "通义千问 (DashScope)",
    kind: "openai",
    base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
    hint: "dashscope.console.aliyun.com",
    needs_key: true,
  },
  {
    id: "zhipu",
    label: "智谱 GLM",
    kind: "openai",
    base_url: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4-plus",
    hint: "open.bigmodel.cn",
    needs_key: true,
  },
  {
    id: "groq",
    label: "Groq",
    kind: "openai",
    base_url: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    hint: "console.groq.com",
    needs_key: true,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai",
    base_url: "https://openrouter.ai/api/v1",
    model: "anthropic/claude-sonnet-4.5",
    hint: "openrouter.ai/keys",
    needs_key: true,
  },
  {
    id: "together",
    label: "Together AI",
    kind: "openai",
    base_url: "https://api.together.xyz/v1",
    model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    needs_key: true,
  },
  {
    id: "mistral",
    label: "Mistral",
    kind: "openai",
    base_url: "https://api.mistral.ai/v1",
    model: "mistral-large-latest",
    needs_key: true,
  },
  {
    id: "ollama",
    label: "Ollama (本地)",
    kind: "ollama",
    base_url: "http://127.0.0.1:11434",
    model: "llama3.2",
    hint: "本地运行，无需 API Key",
    needs_key: false,
  },
];

interface DraftProvider {
  id?: string;
  name: string;
  kind: AIProviderKind;
  base_url: string;
  api_key: string;
  model: string;
  temperature: number;
  max_tokens: number;
  top_p: number;
}

const blankDraft = (preset?: Preset): DraftProvider => ({
  name: preset?.label || "新模型",
  kind: preset?.kind || "openai",
  base_url: preset?.base_url || "",
  api_key: "",
  model: preset?.model || "",
  temperature: 0.7,
  max_tokens: 2048,
  top_p: 1.0,
});

export default function AIProviders() {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [draft, setDraft] = useState<DraftProvider | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => api.aiProviderList().then(setProviders).catch(toastError);
  useEffect(() => {
    load();
  }, []);

  const startNew = (preset?: Preset) => {
    setDraft(blankDraft(preset));
    setShowKey(false);
  };

  const startEdit = (p: AIProvider) => {
    setDraft({
      id: p.id,
      name: p.name,
      kind: p.kind,
      base_url: p.base_url,
      api_key: p.api_key,
      model: p.model,
      temperature: p.temperature,
      max_tokens: p.max_tokens,
      top_p: p.top_p,
    });
    setShowKey(false);
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim() || !draft.model.trim() || !draft.base_url.trim()) {
      toast("请填写名称 / Base URL / Model", "error");
      return;
    }
    setBusy(true);
    try {
      const id = await api.aiProviderSave({ ...draft });
      // first-time save: auto-activate if no other provider is active
      const list = await api.aiProviderList();
      if (!list.some((p) => p.is_active)) {
        await api.aiProviderSetActive(id);
      }
      toast("已保存", "success");
      setDraft(null);
      load();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const r = await api.aiProviderTest({ ...draft });
      toast(`连接成功：${r?.reply || "OK"}`, "success");
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    await api.aiProviderDelete(id);
    load();
  };

  const setActive = async (id: string) => {
    await api.aiProviderSetActive(id);
    load();
  };

  const activeId = useMemo(() => providers.find((p) => p.is_active)?.id, [providers]);

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <TopBar title="AI 模型管理" />
      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl">
        <Card className="p-5">
          <div className="font-medium mb-2 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> 快速添加
          </div>
          <div className="grid grid-cols-3 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => startNew(p)}
                className="text-left p-3 rounded-xl border border-border hover:border-primary hover:bg-accent/40 transition"
              >
                <div className="font-medium text-sm">{p.label}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{p.model}</div>
                {p.hint && <div className="text-[11px] text-muted-foreground mt-1">{p.hint}</div>}
              </button>
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => startNew()}>
              <Plus className="w-3.5 h-3.5" /> 自定义
            </Button>
          </div>
        </Card>

        <Card className="p-5">
          <div className="font-medium mb-3">已添加的模型</div>
          {providers.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-8">
              还没有模型。从上方挑一个模板开始。
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {providers.map((p) => (
              <Card key={p.id} className={cn("p-4", p.is_active && "ring-2 ring-primary")}>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-medium truncate">{p.name}</div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                        {p.kind}
                      </span>
                      {p.is_active && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                          激活中
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 truncate">{p.model}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{p.base_url}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      T={p.temperature} · max={p.max_tokens} · top_p={p.top_p}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  {p.id !== activeId && (
                    <Button size="sm" variant="outline" onClick={() => setActive(p.id)}>
                      <Check className="w-3 h-3" /> 设为激活
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => startEdit(p)}>
                    编辑
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-rose-500"
                    onClick={() => remove(p.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </Card>
      </div>

      {draft && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6"
          onClick={() => setDraft(null)}
        >
          <Card className="max-w-xl w-full p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="font-semibold text-lg">
              {draft.id ? "编辑模型" : "添加模型"}
            </div>

            <Field label="显示名称">
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>

            <Field label="协议类型">
              <select
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value as AIProviderKind })}
                className="h-9 rounded-lg border border-input bg-background px-3 text-sm w-full"
              >
                <option value="openai">OpenAI 兼容（DeepSeek / OpenAI / Moonshot / Qwen / Groq / OpenRouter…）</option>
                <option value="anthropic">Anthropic Claude</option>
                <option value="ollama">Ollama 本地</option>
              </select>
            </Field>

            <Field label="Base URL">
              <Input
                value={draft.base_url}
                placeholder="https://api.deepseek.com/v1"
                onChange={(e) => setDraft({ ...draft, base_url: e.target.value })}
              />
            </Field>

            <Field label="Model">
              <Input
                value={draft.model}
                placeholder="deepseek-chat / gpt-4o-mini / claude-sonnet-4-5 / llama3.2"
                onChange={(e) => setDraft({ ...draft, model: e.target.value })}
              />
            </Field>

            {draft.kind !== "ollama" && (
              <Field label="API Key">
                <div className="relative w-full">
                  <Input
                    type={showKey ? "text" : "password"}
                    value={draft.api_key}
                    onChange={(e) => setDraft({ ...draft, api_key: e.target.value })}
                    placeholder="sk-..."
                  />
                  <button
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </Field>
            )}

            <div className="grid grid-cols-3 gap-3">
              <Field label="Temperature">
                <Input
                  type="number"
                  step="0.05"
                  min={0}
                  max={2}
                  value={draft.temperature}
                  onChange={(e) => setDraft({ ...draft, temperature: Number(e.target.value) })}
                />
              </Field>
              <Field label="Max Tokens">
                <Input
                  type="number"
                  min={64}
                  max={32000}
                  value={draft.max_tokens}
                  onChange={(e) => setDraft({ ...draft, max_tokens: Number(e.target.value) })}
                />
              </Field>
              <Field label="Top P">
                <Input
                  type="number"
                  step="0.05"
                  min={0}
                  max={1}
                  value={draft.top_p}
                  onChange={(e) => setDraft({ ...draft, top_p: Number(e.target.value) })}
                />
              </Field>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" onClick={test} disabled={busy}>
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                测试连接
              </Button>
              <Button variant="outline" onClick={() => setDraft(null)}>
                取消
              </Button>
              <Button onClick={save} disabled={busy}>
                保存
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium mb-1.5 text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}
