import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search as SearchIcon, FolderOpen, RefreshCw, Loader2, Sparkles } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import * as api from "@/api";
import type { SearchHit } from "@/api/types";
import { formatBytes, formatTime, fileIconColor } from "@/lib/format";
import { toast, toastError } from "@/components/ui/toast";

export default function Search() {
  const [searchParams] = useSearchParams();
  const initialQ = searchParams.get("q") || "";
  const [q, setQ] = useState(initialQ);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [indexBusy, setIndexBusy] = useState(false);
  const [intent, setIntent] = useState<any>(null);

  const search = async (queryOverride?: string) => {
    const query = (queryOverride ?? q).trim();
    if (!query) return;
    setBusy(true);
    try {
      const [parsed, results] = await Promise.all([
        api.aiParseIntent(query).catch(() => null),
        api.searchIndex(query, 200),
      ]);
      setIntent(parsed);
      setHits(results);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  // auto-fire when arriving via ?q=...
  useEffect(() => {
    if (initialQ) {
      setQ(initialQ);
      search(initialQ);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ]);

  const reindex = async () => {
    const dir = await openDialog({ directory: true, multiple: false });
    if (!dir) return;
    setIndexBusy(true);
    try {
      const n = await api.indexDirectory(String(dir));
      toast(`索引完成：${n} 个文件`, "success");
    } catch (e) {
      toastError(e);
    } finally {
      setIndexBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <TopBar title="搜索" />
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              autoFocus
              className="pl-9 h-11"
              placeholder="自然语言搜索：上周改过的 PPT、含有季度营收的文档…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
            />
          </div>
          <Button onClick={search} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <SearchIcon className="w-4 h-4" />}
            搜索
          </Button>
          <Button variant="outline" onClick={reindex} disabled={indexBusy}>
            {indexBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            重建索引
          </Button>
        </div>

        {intent && (intent.keywords?.length || intent.extensions?.length || intent.time_after) && (
          <Card className="p-3 bg-primary/5 border-primary/20 flex items-center gap-2 text-xs">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span className="font-medium">意图解析</span>
            {intent.keywords?.length > 0 && (
              <span className="text-muted-foreground">
                关键词: {intent.keywords.join(", ")}
              </span>
            )}
            {intent.extensions?.length > 0 && (
              <span className="text-muted-foreground">
                · 类型: {intent.extensions.join(", ")}
              </span>
            )}
            {intent.time_after && (
              <span className="text-muted-foreground">
                · 时间: {formatTime(intent.time_after)} 后
              </span>
            )}
          </Card>
        )}

        <div className="text-xs text-muted-foreground">{hits.length} 条结果</div>

        <div className="space-y-1">
          {hits.map((h) => (
            <Card
              key={h.path}
              className="p-3 flex items-center gap-3 cursor-pointer hover:shadow-md"
              onClick={() => api.openPath(h.path).catch(toastError)}
            >
              <FolderOpen className={`w-5 h-5 ${fileIconColor(h.ext)}`} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{h.name}</div>
                <div className="text-xs text-muted-foreground truncate">{h.path}</div>
              </div>
              <div className="text-xs text-muted-foreground">{formatBytes(h.size)}</div>
              <div className="text-xs text-muted-foreground w-32">{formatTime(h.modified)}</div>
              <div className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                {h.score.toFixed(2)}
              </div>
            </Card>
          ))}
          {!busy && hits.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-12">
              输入查询并按回车，或先用「重建索引」选择目录建立索引。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
