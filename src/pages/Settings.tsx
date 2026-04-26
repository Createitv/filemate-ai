import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { TopBar } from "@/components/layout/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ACCENT_PRESETS, useThemeStore, type ThemeMode } from "@/stores/theme";
import { SUPPORTED_LANGS } from "@/i18n";
import { Sun, Moon, Monitor, Check, ChevronRight } from "lucide-react";
import * as api from "@/api";
import { cn } from "@/lib/utils";

export default function Settings() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { mode, accent, setMode, setAccent } = useThemeStore();
  const [version, setVersion] = useState("");
  const [activeProvider, setActiveProvider] = useState<string>("");

  useEffect(() => {
    api.appVersion().then(setVersion).catch(() => {});
    api
      .aiHealth()
      .then((h) => h?.ok && setActiveProvider(`${h.active_provider} · ${h.model}`))
      .catch(() => {});
  }, []);

  useEffect(() => {
    api.setSetting("theme.mode", mode).catch(() => {});
    api.setSetting("theme.accent", accent).catch(() => {});
  }, [mode, accent]);
  useEffect(() => {
    api.setSetting("language", i18n.language).catch(() => {});
  }, [i18n.language]);

  const modes: { id: ThemeMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "light", label: t("settings.theme_light"), icon: Sun },
    { id: "dark", label: t("settings.theme_dark"), icon: Moon },
    { id: "system", label: t("settings.theme_system"), icon: Monitor },
  ];

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <TopBar title={t("settings.title")} />
      <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-6 max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.appearance")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="text-sm font-medium mb-2">{t("settings.theme")}</div>
              <div className="grid grid-cols-3 gap-3">
                {modes.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-3 rounded-xl border text-sm",
                      mode === m.id ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40"
                    )}
                  >
                    <m.icon className="w-4 h-4" />
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-sm font-medium mb-2">{t("settings.accent")}</div>
              <div className="flex flex-wrap gap-3">
                {ACCENT_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setAccent(p.id)}
                    className={cn(
                      "w-10 h-10 rounded-xl border-2 flex items-center justify-center transition",
                      accent === p.id ? "border-foreground" : "border-transparent"
                    )}
                    style={{ backgroundColor: `hsl(${p.hsl})` }}
                    title={p.name}
                  >
                    {accent === p.id && <Check className="w-4 h-4 text-white" />}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.language")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {SUPPORTED_LANGS.map((l) => (
                <button
                  key={l.code}
                  onClick={() => i18n.changeLanguage(l.code)}
                  className={cn(
                    "px-4 py-3 rounded-xl border text-sm text-left",
                    i18n.language === l.code ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40"
                  )}
                >
                  {l.name}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.ai")}</CardTitle>
          </CardHeader>
          <CardContent>
            <button
              onClick={() => navigate("/ai-providers")}
              className="w-full flex items-center justify-between p-3 rounded-xl border border-border hover:bg-accent/40"
            >
              <div className="text-left">
                <div className="font-medium text-sm">AI 模型管理</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {activeProvider
                    ? `当前激活：${activeProvider}`
                    : "添加 DeepSeek / OpenAI / Claude / Ollama 等模型"}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.general")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            版本 v{version || "—"}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
