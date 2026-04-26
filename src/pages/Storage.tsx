// /storage — central place to understand and reclaim disk space.
//
// Composed of six sections, all driven by existing backend commands plus
// the new cleanup module: per-volume cards, a folder picker that drives
// the next three sections (biggest / by-extension / oldest), a duplicate
// scan entry, and an OS cache + trash cleanup card.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  HardDrive,
  FolderOpen,
  Loader2,
  Trash2,
  Archive,
  Sparkles,
  Eraser,
  AlertTriangle,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileIcon } from "@/components/FileIcon";
import * as api from "@/api";
import type {
  DiskInfo,
  FolderStats,
  FileBrief,
  CacheDir,
  TrashStats,
} from "@/api/types";
import { formatBytes, formatTime } from "@/lib/format";
import { toast, toastError } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export default function Storage() {
  const navigate = useNavigate();
  const [disks, setDisks] = useState<DiskInfo[]>([]);
  const [path, setPath] = useState("");
  const [stats, setStats] = useState<FolderStats | null>(null);
  const [scanning, setScanning] = useState(false);
  const [caches, setCaches] = useState<CacheDir[]>([]);
  const [trash, setTrash] = useState<TrashStats | null>(null);
  const [loadingCleanup, setLoadingCleanup] = useState(false);

  // Load disks + cleanup info on mount; default folder = home dir.
  useEffect(() => {
    api.listDisks().then(setDisks).catch(toastError);
    refreshCleanup();
    api.homeDir().then((h) => setPath(h)).catch(() => {});
  }, []);

  const refreshCleanup = async () => {
    setLoadingCleanup(true);
    try {
      const [c, t] = await Promise.all([
        api.cacheDirs().catch(() => []),
        api.trashStats().catch(() => null),
      ]);
      setCaches(c);
      setTrash(t);
    } finally {
      setLoadingCleanup(false);
    }
  };

  const pickFolder = async () => {
    const r = await openDialog({ directory: true, multiple: false });
    if (r) setPath(String(r));
  };

  const scan = async (target?: string) => {
    const p = (target ?? path).trim();
    if (!p) return;
    setScanning(true);
    setStats(null);
    try {
      setStats(await api.analyzeFolderSummary(p));
    } catch (e) {
      toastError(e);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <TopBar title="存储管理" />
      <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-6 max-w-6xl">
        {/* 1. Volumes */}
        <DisksGrid disks={disks} />

        {/* Folder picker */}
        <Card className="p-4 flex items-center gap-2">
          <Input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="选一个目录扫描"
            className="flex-1"
          />
          <Button variant="outline" onClick={pickFolder}>
            <FolderOpen className="w-3.5 h-3.5" /> 选择
          </Button>
          <Button onClick={() => scan()} disabled={scanning || !path}>
            {scanning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            扫描
          </Button>
        </Card>

        {/* 2-4 Three column grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <BigFiles
            files={stats?.biggest || []}
            scanning={scanning}
            onAfterDelete={(p) =>
              setStats((s) =>
                s
                  ? { ...s, biggest: s.biggest.filter((f) => f.path !== p) }
                  : s
              )
            }
          />
          <TypeBreakdown items={stats?.by_extension || []} scanning={scanning} />
          <OldestFiles
            files={stats?.oldest || []}
            scanning={scanning}
            onAfterArchive={(p) =>
              setStats((s) =>
                s ? { ...s, oldest: s.oldest.filter((f) => f.path !== p) } : s
              )
            }
          />
        </div>

        {/* 5-6 Bottom row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DuplicatesCard
            count={stats?.potential_dupes ?? 0}
            scanning={scanning}
            onClick={() => navigate("/duplicates")}
          />
          <CleanupCard
            caches={caches}
            trash={trash}
            loading={loadingCleanup}
            onRefresh={refreshCleanup}
          />
        </div>
      </div>
    </div>
  );
}

// -------------------- Disks grid --------------------

function DisksGrid({ disks }: { disks: DiskInfo[] }) {
  if (disks.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        正在读取磁盘信息…
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {disks.map((d) => (
        <DiskCard key={d.mount_point} disk={d} />
      ))}
    </div>
  );
}

function DiskCard({ disk }: { disk: DiskInfo }) {
  const percent = Math.min(100, Math.max(0, disk.percent));
  const color =
    percent > 90
      ? "hsl(346 77% 55%)"
      : percent > 75
      ? "hsl(38 92% 50%)"
      : "hsl(var(--primary))";
  const r = 36;
  const c = 2 * Math.PI * r;
  return (
    <Card
      className="p-4 cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => api.openPath(disk.mount_point).catch(() => {})}
    >
      <div className="flex items-center gap-2 mb-3">
        <HardDrive className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium truncate flex-1">
          {disk.name || disk.mount_point.split(/[\\/]/).filter(Boolean).pop() || "/"}
        </span>
        <span className="text-[10px] text-muted-foreground">{disk.fs}</span>
      </div>
      <div className="flex items-center justify-center py-2">
        <div className="relative w-24 h-24">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r={r} stroke="hsl(var(--border))" strokeWidth="3" fill="none" />
            <circle
              cx="40"
              cy="40"
              r={r}
              stroke={color}
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c - (percent / 100) * c}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-base font-semibold tabular-nums">
              {Math.round(percent)}%
            </div>
            <div className="text-[9px] text-muted-foreground">
              {formatBytes(disk.used)}
            </div>
          </div>
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground text-center mt-1 tabular-nums">
        可用 {formatBytes(disk.available)} / {formatBytes(disk.total)}
      </div>
    </Card>
  );
}

// -------------------- Big files --------------------

function BigFiles({
  files,
  scanning,
  onAfterDelete,
}: {
  files: FileBrief[];
  scanning: boolean;
  onAfterDelete: (path: string) => void;
}) {
  const handleDelete = async (file: FileBrief) => {
    if (!confirm(`确定将 "${file.name}" 移到回收站？`)) return;
    try {
      await api.deleteToTrash([file.path]);
      onAfterDelete(file.path);
      toast("已移至回收站", "success");
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <Card className="p-4">
      <SectionTitle icon={Trash2} title="大文件 Top 10" subtitle="按字节降序" />
      <List
        empty={files.length === 0}
        scanning={scanning}
        emptyText="选目录扫描后显示"
      >
        {files.slice(0, 10).map((f) => (
          <div
            key={f.path}
            className="flex items-center gap-2.5 py-1.5 group"
          >
            <FileIcon name={f.name} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{f.name}</div>
              <div className="text-[10px] text-muted-foreground truncate">
                {f.path}
              </div>
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatBytes(f.size)}
            </span>
            <button
              onClick={() => handleDelete(f)}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-500"
              title="移至回收站"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </List>
    </Card>
  );
}

// -------------------- Type breakdown --------------------

function TypeBreakdown({
  items,
  scanning,
}: {
  items: Array<[string, number, number]>;
  scanning: boolean;
}) {
  const top = items.slice(0, 12);
  const max = top.length ? top[0][2] : 1;
  return (
    <Card className="p-4">
      <SectionTitle icon={Archive} title="占用类型分布" subtitle="按字节" />
      <List empty={top.length === 0} scanning={scanning} emptyText="选目录扫描后显示">
        {top.map(([ext, count, bytes]) => {
          const pct = max > 0 ? (bytes / max) * 100 : 0;
          return (
            <div key={ext} className="py-1.5">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-mono w-16 text-muted-foreground truncate">.{ext}</span>
                <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="tabular-nums w-16 text-right text-muted-foreground">
                  {formatBytes(bytes)}
                </span>
                <span className="tabular-nums w-10 text-right text-muted-foreground">
                  {count}
                </span>
              </div>
            </div>
          );
        })}
      </List>
    </Card>
  );
}

// -------------------- Oldest files --------------------

function OldestFiles({
  files,
  scanning,
  onAfterArchive,
}: {
  files: FileBrief[];
  scanning: boolean;
  onAfterArchive: (path: string) => void;
}) {
  const archive = async (file: FileBrief) => {
    if (!confirm(`将 "${file.name}" 移到 _Archive 目录？`)) return;
    try {
      const home = await api.homeDir();
      const dest = `${home}/_Archive/${file.name}`;
      await api.moveEntry(file.path, dest);
      onAfterArchive(file.path);
      toast(`已归档到 ${dest}`, "success");
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <Card className="p-4">
      <SectionTitle icon={Archive} title="久未访问" subtitle="按修改时间升序" />
      <List
        empty={files.length === 0}
        scanning={scanning}
        emptyText="选目录扫描后显示"
      >
        {files.slice(0, 10).map((f) => (
          <div key={f.path} className="flex items-center gap-2.5 py-1.5 group">
            <FileIcon name={f.name} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{f.name}</div>
              <div className="text-[10px] text-muted-foreground">
                {formatTime(f.modified)}
              </div>
            </div>
            <button
              onClick={() => archive(f)}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary"
              title="归档"
            >
              <Archive className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </List>
    </Card>
  );
}

// -------------------- Duplicates entry --------------------

function DuplicatesCard({
  count,
  scanning,
  onClick,
}: {
  count: number;
  scanning: boolean;
  onClick: () => void;
}) {
  return (
    <Card className="p-5">
      <SectionTitle
        icon={AlertTriangle}
        title="重复文件"
        subtitle="基于大小快速估算"
      />
      <div className="flex items-end gap-3 mt-3">
        <div className="text-3xl font-semibold tabular-nums">
          {scanning ? "—" : count}
        </div>
        <div className="text-xs text-muted-foreground pb-1.5">
          个疑似重复（按字节相同估算）
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="w-full mt-3"
        onClick={onClick}
      >
        精确扫描（SHA-256） →
      </Button>
    </Card>
  );
}

// -------------------- Cleanup card --------------------

function CleanupCard({
  caches,
  trash,
  loading,
  onRefresh,
}: {
  caches: CacheDir[];
  trash: TrashStats | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const cleanCache = async (c: CacheDir) => {
    if (!confirm(`确定清空「${c.label}」？将释放约 ${formatBytes(c.size)}。`)) return;
    try {
      const freed = await api.clearCacheDir(c.path);
      toast(`已释放 ${formatBytes(freed)}`, "success");
      onRefresh();
    } catch (e) {
      toastError(e);
    }
  };
  const clearTrash = async () => {
    if (!confirm("清空系统回收站？此操作无法撤销。")) return;
    try {
      await api.emptyTrash();
      toast("已清空回收站", "success");
      onRefresh();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <Card className="p-5">
      <SectionTitle icon={Eraser} title="清理空间" subtitle="缓存 + 回收站" />
      <div className="space-y-2 mt-3">
        {caches.map((c) => (
          <div
            key={c.path}
            className="flex items-center gap-3 py-2 px-3 rounded-lg bg-secondary/40"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{c.label}</div>
              <div className="text-[10px] text-muted-foreground truncate">
                {c.path}
              </div>
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatBytes(c.size)}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => cleanCache(c)}
              disabled={c.size === 0}
            >
              清理
            </Button>
          </div>
        ))}
        {trash && (
          <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-secondary/40">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">回收站</div>
              <div className="text-[10px] text-muted-foreground tabular-nums">
                {trash.item_count} 项
              </div>
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatBytes(trash.size)}
            </span>
            <Button size="sm" variant="outline" onClick={clearTrash}>
              清空
            </Button>
          </div>
        )}
        {!loading && caches.length === 0 && !trash && (
          <div className="text-xs text-muted-foreground py-4 text-center">
            没有可清理项
          </div>
        )}
      </div>
    </Card>
  );
}

// -------------------- helpers --------------------

function SectionTitle({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-4 h-4 text-primary" />
      <span className="font-medium text-sm">{title}</span>
      {subtitle && (
        <span className="text-[11px] text-muted-foreground">· {subtitle}</span>
      )}
    </div>
  );
}

function List({
  empty,
  scanning,
  emptyText,
  children,
}: {
  empty: boolean;
  scanning: boolean;
  emptyText: string;
  children: React.ReactNode;
}) {
  if (scanning) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-muted-foreground gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> 正在扫描…
      </div>
    );
  }
  if (empty) {
    return (
      <div className={cn("text-xs text-muted-foreground py-6 text-center")}>
        {emptyText}
      </div>
    );
  }
  return <div className="mt-2">{children}</div>;
}
