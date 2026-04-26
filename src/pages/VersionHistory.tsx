import { useEffect, useState } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import * as api from "@/api";
import type { VersionInfo } from "@/api/types";
import { toast, toastError } from "@/components/ui/toast";
import { formatBytes, formatTime } from "@/lib/format";

export default function VersionHistory() {
  const [path, setPath] = useState("");
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [diff, setDiff] = useState("");
  const [pair, setPair] = useState<[number?, number?]>([]);

  const pick = async () => {
    const p = await openDialog({ multiple: false });
    if (p) {
      setPath(String(p));
      load(String(p));
    }
  };
  const load = (p: string) => api.listVersions(p).then(setVersions).catch(toastError);

  const snapshot = async () => {
    if (!path) return;
    try {
      await api.createVersion(path);
      toast("已创建版本", "success");
      load(path);
    } catch (e) {
      toastError(e);
    }
  };

  const restore = async (vid: number) => {
    try {
      await api.restoreVersion(path, vid);
      toast("已恢复", "success");
      load(path);
    } catch (e) {
      toastError(e);
    }
  };

  const showDiff = async (a: number, b: number) => {
    try {
      const text = await api.diffVersions(path, a, b);
      setDiff(text);
    } catch (e) {
      toastError(e);
    }
  };

  const togglePair = (vid: number) => {
    setPair((p) => {
      if (!p[0]) return [vid, undefined];
      if (!p[1]) {
        const next: [number?, number?] = [p[0], vid];
        showDiff(next[0]!, next[1]!);
        return next;
      }
      return [vid, undefined];
    });
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <TopBar title="版本历史" />
      <div className="p-6 space-y-4 flex-1 overflow-y-auto">
        <Card className="p-5 flex items-center gap-2">
          <Input value={path} placeholder="选择文件" readOnly className="flex-1" />
          <Button variant="outline" onClick={pick}>
            选择文件
          </Button>
          <Button onClick={snapshot} disabled={!path}>
            创建快照
          </Button>
        </Card>

        <div className="grid grid-cols-2 gap-4 flex-1">
          <Card className="p-4">
            <div className="font-medium mb-2 text-sm">版本时间线</div>
            <div className="space-y-1 text-sm">
              {versions.map((v) => (
                <div
                  key={v.id}
                  onClick={() => togglePair(v.version_id)}
                  className={`flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer hover:bg-accent/40 ${
                    pair.includes(v.version_id) ? "bg-primary/10 border border-primary/30" : ""
                  }`}
                >
                  <span className="font-mono text-xs text-muted-foreground w-8">v{v.version_id}</span>
                  <span className="flex-1">{formatTime(v.timestamp)}</span>
                  <span className="text-xs text-muted-foreground">{formatBytes(v.size)}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary">{v.storage}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      restore(v.version_id);
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    恢复
                  </button>
                </div>
              ))}
              {versions.length === 0 && (
                <div className="text-xs text-muted-foreground py-4 text-center">
                  此文件还没有快照
                </div>
              )}
            </div>
          </Card>

          <Card className="p-4">
            <div className="font-medium mb-2 text-sm">
              对比 {pair[0] && pair[1] ? `v${pair[0]} ↔ v${pair[1]}` : "（点选两个版本）"}
            </div>
            <pre className="text-xs font-mono overflow-auto max-h-[60vh] whitespace-pre-wrap leading-relaxed">
              {diff || "—"}
            </pre>
          </Card>
        </div>
      </div>
    </div>
  );
}
