import { useTranslation } from "react-i18next";
import { Search, Bell, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function TopBar({ title }: { title?: string }) {
  const { t } = useTranslation();
  return (
    <header className="h-14 px-6 flex items-center gap-4 border-b border-border/60 bg-background/60 backdrop-blur">
      {title && <h1 className="font-semibold text-base">{title}</h1>}
      <div className="flex-1 max-w-xl ml-auto relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input className="pl-9 bg-secondary/60 border-transparent" placeholder={t("common.search")} />
      </div>
      <Button variant="ghost" size="icon">
        <Plus className="w-4 h-4" />
      </Button>
      <Button variant="ghost" size="icon">
        <Bell className="w-4 h-4" />
      </Button>
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/50" />
    </header>
  );
}
