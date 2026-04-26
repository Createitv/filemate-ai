import { useEffect, useState } from "react";
import { Tag as TagIcon, Plus, Trash2, FileText } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as api from "@/api";
import type { Tag } from "@/api/types";
import { toast, toastError } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const COLORS = [
  "#3B82F6", "#8B5CF6", "#EC4899", "#F59E0B", "#10B981", "#EF4444", "#6366F1", "#06B6D4",
];

export default function Tags() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [active, setActive] = useState<Tag | null>(null);
  const [paths, setPaths] = useState<string[]>([]);

  const load = () => api.listTags().then(setTags).catch(toastError);
  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (active) api.pathsWithTag(active.id).then(setPaths).catch(toastError);
    else setPaths([]);
  }, [active]);

  const create = async () => {
    if (!name.trim()) return;
    try {
      await api.createTag(name, color);
      setName("");
      load();
      toast("已创建标签", "success");
    } catch (e) {
      toastError(e);
    }
  };

  const remove = async (id: number) => {
    await api.deleteTag(id);
    if (active?.id === id) setActive(null);
    load();
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <TopBar title="标签管理" />
      <div className="grid grid-cols-3 gap-6 p-6 flex-1 overflow-y-auto">
        <div className="col-span-2 space-y-4">
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <Input placeholder="新标签名" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
              <div className="flex items-center gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={cn(
                      "w-6 h-6 rounded-full",
                      color === c && "ring-2 ring-offset-2 ring-primary"
                    )}
                    style={{ background: c }}
                  />
                ))}
              </div>
              <Button onClick={create}>
                <Plus className="w-4 h-4" /> 添加
              </Button>
            </div>
          </Card>

          <div className="grid grid-cols-3 gap-3">
            {tags.map((t) => (
              <Card
                key={t.id}
                onClick={() => setActive(t)}
                className={cn(
                  "p-4 cursor-pointer hover:shadow-md transition flex items-center gap-3",
                  active?.id === t.id && "ring-2 ring-primary"
                )}
              >
                <span className="w-3 h-3 rounded-full" style={{ background: t.color }} />
                <span className="flex-1 truncate font-medium">{t.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(t.id);
                  }}
                  className="text-muted-foreground hover:text-rose-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </Card>
            ))}
          </div>
        </div>

        <Card className="p-4">
          <div className="font-medium flex items-center gap-2 mb-3">
            <TagIcon className="w-4 h-4" />
            {active ? `「${active.name}」下的文件 (${paths.length})` : "选择一个标签"}
          </div>
          <div className="space-y-1 text-sm">
            {paths.map((p) => (
              <div
                key={p}
                onClick={() => api.openPath(p).catch(toastError)}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/40 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="truncate">{p}</span>
              </div>
            ))}
            {active && paths.length === 0 && (
              <div className="text-xs text-muted-foreground py-4 text-center">
                此标签下没有文件
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
