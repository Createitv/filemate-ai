import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TopBar } from "@/components/layout/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ACCENT_PRESETS, useThemeStore, type ThemeMode } from "@/stores/theme";
import { SUPPORTED_LANGS } from "@/i18n";
import { Sun, Moon, Monitor, Check } from "lucide-react";
import * as api from "@/api";
import { toast, toastError } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export default function Settings() {
  const { t, i18n } = useTranslation();
  const { mode, accent, setMode, setAccent } = useThemeStore();
  const [ollamaHost, setOllamaHost] = useState("");
  const [version, setVersion] = useState("");

  useEffect(() => {
    api.getSetting<string>("ollama_host").then((v) => v && setOllamaHost(v));
    api.appVersion().then(setVersion).catch(() => {});
  }, []);

  // persist theme + language to backend on change
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

  const saveOllama = async () => {
    try {
      await api.setSetting("ollama_host", ollamaHost);
      toast("已保存", "success");
    } catch (e) {
      toastError(e);
    }
  };

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
          <CardContent className="space-y-3">
            <div className="text-xs text-muted-foreground">
              FileMate 默认连接本地 <code>http://127.0.0.1:11434</code> 上的 Ollama 服务。如需自定义，可在此填写并重启应用。
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="http://127.0.0.1:11434"
                value={ollamaHost}
                onChange={(e) => setOllamaHost(e.target.value)}
              />
              <Button onClick={saveOllama}>保存</Button>
            </div>
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
