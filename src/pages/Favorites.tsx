import { useEffect, useState } from "react";
import { Star, Trash2, FolderOpen } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import * as api from "@/api";
import type { Bookmark } from "@/api/types";
import { toast, toastError } from "@/components/ui/toast";

export default function Favorites() {
  const [items, setItems] = useState<Bookmark[]>([]);

  const load = () => api.listBookmarks().then(setItems).catch(toastError);
  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    const dir = await openDialog({ directory: true, multiple: false });
    if (!dir) return;
    const path = String(dir);
    const name = path.split(/[\\/]/).pop() || path;
    try {
      await api.addBookmark(path, name);
      load();
      toast("已加入收藏", "success");
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <TopBar title="收藏" />
      <div className="p-6 space-y-4">
        <div className="flex justify-end">
          <Button onClick={add}>
            <Star className="w-4 h-4" /> 添加收藏
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {items.map((b) => (
            <Card key={b.id} className="p-4 group">
              <div className="flex items-start gap-2">
                <Star className="w-4 h-4 text-amber-500 mt-0.5 fill-amber-500" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{b.name}</div>
                  <div className="text-xs text-muted-foreground truncate mt-0.5">{b.path}</div>
                </div>
                <button
                  onClick={() => api.removeBookmark(b.id).then(load).catch(toastError)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full"
                onClick={() => api.openPath(b.path).catch(toastError)}
              >
                <FolderOpen className="w-3.5 h-3.5" /> 打开
              </Button>
            </Card>
          ))}
          {items.length === 0 && (
            <div className="col-span-3 text-center text-sm text-muted-foreground py-12">
              还没有收藏，点击右上角添加
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
