import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Send, Sparkles, Loader2, AlertCircle, Settings as SettingsIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import * as api from "@/api";
import type { ChatMessage } from "@/api/types";
import { cn } from "@/lib/utils";

export function AIPanel() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "你好！我是 FileMate AI 助手。可以帮你搜索、整理、分析文件。" },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<{ ok: boolean; provider?: string; model?: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .aiHealth()
      .then((h) =>
        setHealth({ ok: !!h?.ok, provider: h?.active_provider, model: h?.model })
      )
      .catch(() => setHealth({ ok: false }));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    const next: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const reply = await api.aiChat(next);
      setMessages((m) => [...m, reply]);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `调用 AI 失败：${e?.message || e}\n\n请到「AI 模型」中配置一个模型并设为激活（DeepSeek / OpenAI / Claude / Ollama 等）。`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const suggestions = [t("ai.q1"), t("ai.q2"), t("ai.q3"), t("ai.q4")];

  return (
    <aside className="w-80 shrink-0 border-l border-border/60 bg-gradient-to-b from-accent/40 to-background flex flex-col">
      <div className="px-5 py-4 flex items-center gap-2 border-b border-border/40">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-primary" />
        </div>
        <span className="font-medium">{t("ai.panel_title")}</span>
<span className="ml-auto flex items-center gap-1 text-[10px]">
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              health?.ok ? "bg-emerald-500" : health ? "bg-rose-500" : "bg-amber-500"
            )}
          />
          <button
            onClick={() => navigate("/ai-providers")}
            className="text-muted-foreground hover:text-primary"
          >
            {health?.ok ? `${health.provider} · ${health.model}` : "未配置"}
          </button>
          <button onClick={() => navigate("/ai-providers")} className="ml-1 text-muted-foreground hover:text-primary">
            <SettingsIcon className="w-3 h-3" />
          </button>
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[90%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed",
              m.role === "user"
                ? "ml-auto rounded-tr-sm bg-primary text-primary-foreground"
                : "rounded-tl-sm bg-card border border-border/60"
            )}
          >
            {m.content}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> AI 思考中…
          </div>
        )}
        {messages.length <= 1 && (
          <>
            <div className="text-xs text-muted-foreground mt-4">{t("ai.suggested")}</div>
            <div className="space-y-2">
              {suggestions.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="w-full text-left text-sm rounded-xl border border-border/60 bg-card hover:bg-accent/60 transition-colors px-3 py-2.5"
                >
                  {q}
                </button>
              ))}
            </div>
          </>
        )}
{health && !health.ok && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300 flex gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              还没有激活的 AI 模型。
              <button
                onClick={() => navigate("/ai-providers")}
                className="ml-1 underline font-medium"
              >
                去配置 →
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-border/40">
        <div className="relative">
          <Input
            className="pr-10 rounded-xl"
            placeholder={t("ai.input_placeholder")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button
            onClick={() => send()}
            disabled={busy}
            className="absolute right-1.5 top-1.5 w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
