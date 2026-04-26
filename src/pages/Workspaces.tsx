import { useEffect, useState } from "react";
import { Plus, LayoutGrid, Trash2 } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as api from "@/api";
import type { Workspace } from "@/api/types";
import { toastError, toast } from "@/components/ui/toast";
import { relativeTime } from "@/lib/format";

export default function Workspaces() {
  const [items, setItems] = useState<Workspace[]>([]);
  const [newName, setNewName] = useState("");

  const load = () => api.listWorkspaces().then(setItems).catch(toastError);
  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    if (!newName.trim()) return;
    try {
      await api.saveWorkspace(newName, { panes: [], tabs: [] });
      setNewName("");
      load();
      toast("工作区已创建", "success");
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <TopBar title="工作区" />
      <div className="p-6 space-y-4 flex-1 overflow-y-auto">
        <Card className="p-4 flex items-center gap-2">
          <Input
            placeholder="新工作区名称（如：开发项目 / 设计素材）"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1"
          />
          <Button onClick={create}>
            <Plus className="w-4 h-4" /> 创建
          </Button>
        </Card>

        <div className="grid grid-cols-3 gap-4">
          {items.map((w) => (
            <Card key={w.id} className="p-5 group">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/30 to-primary/5 flex items-center justify-center">
                  <LayoutGrid className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{w.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    更新于 {relativeTime(w.updated_at)}
                  </div>
                </div>
                <button
                  onClick={() => api.deleteWorkspace(w.id).then(load).catch(toastError)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </Card>
          ))}
          {items.length === 0 && (
            <div className="col-span-3 text-center text-sm text-muted-foreground py-12">
              还没有工作区
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
