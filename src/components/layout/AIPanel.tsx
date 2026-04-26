import { useTranslation } from "react-i18next";
import { Send, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";

export function AIPanel() {
  const { t } = useTranslation();
  const suggestions = [
    t("ai.q1"),
    t("ai.q2"),
    t("ai.q3"),
    t("ai.q4"),
  ];

  return (
    <aside className="w-80 shrink-0 border-l border-border/60 bg-gradient-to-b from-accent/40 to-background flex flex-col">
      <div className="px-5 py-4 flex items-center gap-2 border-b border-border/40">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-primary" />
        </div>
        <span className="font-medium">{t("ai.panel_title")}</span>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-3">
        <div className="rounded-2xl rounded-tl-sm bg-card border border-border/60 p-3 text-sm leading-relaxed">
          你好！我是 FileMate AI 助手，可以帮你搜索、整理、分析文件。
        </div>
        <div className="text-xs text-muted-foreground mt-4">{t("ai.suggested")}</div>
        <div className="space-y-2">
          {suggestions.map((q) => (
            <button
              key={q}
              className="w-full text-left text-sm rounded-xl border border-border/60 bg-card hover:bg-accent/60 transition-colors px-3 py-2.5"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 border-t border-border/40">
        <div className="relative">
          <Input className="pr-10 rounded-xl" placeholder={t("ai.input_placeholder")} />
          <button className="absolute right-1.5 top-1.5 w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
