import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Search, Bell, Settings as SettingsIcon, Loader2, Database } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useIndexStatus } from "@/stores/indexStatus";

export function TopBar({ title }: { title?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const indexStatus = useIndexStatus();

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
          placeholder={t("common.search") + "（按文件名搜索）"}
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
      <IndexBadge status={indexStatus} onClick={() => navigate("/search")} />
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

function IndexBadge({
  status,
  onClick,
}: {
  status: ReturnType<typeof useIndexStatus>;
  onClick: () => void;
}) {
  if (!status) return null;
  const indexing = status.indexing;
  const count = indexing ? status.progress : status.count;
  if (!indexing && count === 0) return null;
  return (
    <button
      onClick={onClick}
      title={indexing ? "正在建立文件名索引" : `已索引 ${count.toLocaleString()} 项 · 点击搜索`}
      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent/40 tabular-nums"
    >
      {indexing ? (
        <Loader2 className="w-3 h-3 animate-spin text-primary" />
      ) : (
        <Database className="w-3 h-3 text-primary/70" />
      )}
      {indexing ? `索引中 ${count.toLocaleString()}` : count.toLocaleString()}
    </button>
  );
}
