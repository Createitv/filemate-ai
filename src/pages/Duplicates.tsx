import { useState } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import * as api from "@/api";
import { toastError } from "@/components/ui/toast";
import { formatBytes } from "@/lib/format";
import { Trash2 } from "lucide-react";

export default function Duplicates() {
  const [root, setRoot] = useState("");
  const [minSize, setMinSize] = useState(4096);
  const [groups, setGroups] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    const p = await openDialog({ directory: true, multiple: false });
    if (p) setRoot(String(p));
  };
  const scan = async () => {
    if (!root) return;
    setBusy(true);
    try {
      setGroups(await api.findDuplicates(root, minSize));
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <TopBar title="重复文件检测" />
      <div className="p-6 space-y-4 flex-1 overflow-y-auto">
        <Card className="p-5 flex items-center gap-2">
          <Input value={root} placeholder="选择目录" readOnly className="flex-1" />
          <Button variant="outline" onClick={pick}>
            选择
          </Button>
          <Input
            type="number"
            value={minSize}
            onChange={(e) => setMinSize(Number(e.target.value))}
            placeholder="最小大小 (B)"
            className="w-32"
          />
          <Button onClick={scan} disabled={busy}>
            扫描
          </Button>
        </Card>

        <div className="space-y-3">
          {groups.map((g, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-muted-foreground font-mono">{g.checksum.slice(0, 16)}…</div>
                <div className="text-xs text-muted-foreground">
                  {g.paths.length} 个 · {formatBytes(g.size)}
                </div>
              </div>
              <div className="space-y-1 text-sm">
                {g.paths.map((p: string) => (
                  <div
                    key={p}
                    className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent/40"
                  >
                    <span className="flex-1 truncate">{p}</span>
                    <button
                      className="text-muted-foreground hover:text-rose-500"
                      onClick={() => api.deleteToTrash([p]).catch(toastError)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          ))}
          {!busy && groups.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-12">
              选择目录后点击扫描，相同大小+SHA-256 命中的文件会列在这里。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
