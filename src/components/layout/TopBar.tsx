import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Search, Bell, Settings as SettingsIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function TopBar({ title }: { title?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const submit = () => {
    if (!q.trim()) return;
    navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <header className="h-14 px-6 flex items-center gap-4 border-b border-border/60 bg-background/60 backdrop-blur">
      {title && <h1 className="font-semibold text-base">{title}</h1>}
      <div className="flex-1 max-w-xl ml-auto relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9 bg-secondary/60 border-transparent"
          placeholder={t("common.search") + "（自然语言：上周改过的 PPT…）"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
      </div>
      <Button
        variant="ghost"
        size="icon"
        title={t("nav.settings")}
        onClick={() => navigate("/settings")}
      >
        <SettingsIcon className="w-4 h-4" />
      </Button>
      <Button variant="ghost" size="icon" title="通知">
        <Bell className="w-4 h-4" />
      </Button>
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/50" />
    </header>
  );
}
