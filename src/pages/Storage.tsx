// /storage — storage management hub modeled after macOS native Storage,
// CleanMyMac, and Windows Storage Sense. Five sections, top to bottom:
//
//   A. Overview — stacked color bar showing space breakdown by category
//   B. Smart Clean — checkboxes (cache / trash / old downloads) + one-click
//   C. Categories — 6 cards (apps / docs / images / videos / audio / other)
//   D. Smart Lists — big files / oldest / duplicates entry
//   E. Auto Rules — toggles persisted to settings (run-on-startup model)
//
// Read-only / scan operations are aggressive (auto-fire on mount); mutating
// operations always require an explicit click + confirm.

import { useEffect, useMemo, useState } from "react";
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
  Zap,
  AppWindow,
  FileText,
  Image as ImageIcon,
  Film,
  Music as MusicIcon,
  Package,
  Wand2,
  Download,
  RefreshCw,
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
  OldFilesReport,
} from "@/api/types";
import { formatBytes, formatTime } from "@/lib/format";
import { toast, toastError } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

// ---------- category bucketing ----------
type Cat = "app" | "doc" | "image" | "video" | "audio" | "other";

const EXT_TO_CAT: Record<string, Cat> = {
  // apps
  app: "app", exe: "app", msi: "app", dmg: "app", deb: "app", rpm: "app", apk: "app", pkg: "app",
  // docs
  pdf: "doc", doc: "doc", docx: "doc", xls: "doc", xlsx: "doc", ppt: "doc", pptx: "doc",
  csv: "doc", tsv: "doc", md: "doc", txt: "doc", rtf: "doc", json: "doc", xml: "doc",
  yaml: "doc", yml: "doc", toml: "doc", html: "doc", htm: "doc", rst: "doc", log: "doc",
  // images
  jpg: "image", jpeg: "image", png: "image", gif: "image", webp: "image", bmp: "image",
  heic: "image", tiff: "image", svg: "image", ico: "image", raw: "image", cr2: "image",
  cr3: "image", nef: "image", arw: "image", dng: "image", psd: "image", psb: "image",
  ai: "image", sketch: "image",
  // videos
  mp4: "video", mov: "video", mkv: "video", avi: "video", webm: "video", m4v: "video", flv: "video",
  // audio
  mp3: "audio", flac: "audio", wav: "audio", aac: "audio", m4a: "audio", ogg: "audio", opus: "audio",
};

const CATEGORY_META: Array<{ id: Cat; label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = [
  { id: "app",   label: "应用",   icon: AppWindow,  color: "from-violet-500 to-fuchsia-500" },
  { id: "doc",   label: "文档",   icon: FileText,   color: "from-blue-500 to-indigo-500" },
  { id: "image", label: "图片",   icon: ImageIcon,  color: "from-rose-500 to-pink-500" },
  { id: "video", label: "视频",   icon: Film,       color: "from-amber-500 to-orange-500" },
  { id: "audio", label: "音频",   icon: MusicIcon,  color: "from-emerald-500 to-teal-500" },
  { id: "other", label: "其他",   icon: Package,    color: "from-slate-400 to-slate-500" },
];

interface CatBucket { count: number; bytes: number; }
type Buckets = Record<Cat, CatBucket>;
const emptyBuckets = (): Buckets => ({
  app: { count: 0, bytes: 0 },
  doc: { count: 0, bytes: 0 },
  image: { count: 0, bytes: 0 },
  video: { count: 0, bytes: 0 },
  audio: { count: 0, bytes: 0 },
  other: { count: 0, bytes: 0 },
});

function bucketize(byExt: Array<[string, number, number]>): Buckets {
  const out = emptyBuckets();
  for (const [ext, count, bytes] of byExt) {
    const cat = EXT_TO_CAT[ext.toLowerCase()] || "other";
    out[cat].count += count;
    out[cat].bytes += bytes;
  }
  return out;
}

// ---------- main page ----------

export default function Storage() {
  const navigate = useNavigate();
  const [disks, setDisks] = useState<DiskInfo[]>([]);
  const [path, setPath] = useState("");
  const [stats, setStats] = useState<FolderStats | null>(null);
  const [scanning, setScanning] = useState(false);
  const [caches, setCaches] = useState<CacheDir[]>([]);
  const [trash, setTrash] = useState<TrashStats | null>(null);
  const [oldDownloads, setOldDownloads] = useState<OldFilesReport | null>(null);
  const [downloadsPath, setDownloadsPath] = useState<string>("");
  const [autoEmptyTrash, setAutoEmptyTrash] = useState(false);
  const [autoClearDownloads, setAutoClearDownloads] = useState(false);
  const [weeklyScan, setWeeklyScan] = useState(false);

  // Load all read-only data on mount
  useEffect(() => {
    api.listDisks().then(setDisks).catch(toastError);
    refreshCleanup();
    api
      .listUserDirs()
      .then((dirs) => {
        const home = dirs.find((d) => d.kind === "home")?.path;
        const dl = dirs.find((d) => d.kind === "download")?.path;
        if (dl) setDownloadsPath(dl);
        if (home) {
          setPath(home);
          scan(home);
        }
      })
      .catch(() => {});
    // load auto-rule toggles
    Promise.all([
      api.getSetting<boolean>("storage.auto_empty_trash"),
      api.getSetting<boolean>("storage.auto_clear_downloads"),
      api.getSetting<boolean>("storage.weekly_scan"),
    ]).then(([a, b, c]) => {
      setAutoEmptyTrash(!!a);
      setAutoClearDownloads(!!b);
      setWeeklyScan(!!c);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-scan old downloads whenever downloadsPath becomes known
  useEffect(() => {
    if (!downloadsPath) return;
    api
      .oldFilesIn(downloadsPath, 30)
      .then(setOldDownloads)
      .catch(() => {});
  }, [downloadsPath]);

  const refreshCleanup = async () => {
    try {
      const [c, t] = await Promise.all([
        api.cacheDirs().catch(() => []),
        api.trashStats().catch(() => null),
      ]);
      setCaches(c);
      setTrash(t);
    } catch (e) {
      toastError(e);
    }
  };

  const pickFolder = async () => {
    const r = await openDialog({ directory: true, multiple: false });
    if (r) {
      setPath(String(r));
      scan(String(r));
    }
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
      <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-5 max-w-6xl">
        <DisksGrid disks={disks} />

        {/* Folder picker */}
        <Card className="p-4 flex items-center gap-2">
          <Input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="选一个目录扫描（默认家目录）"
            className="flex-1"
          />
          <Button variant="outline" onClick={pickFolder}>
            <FolderOpen className="w-3.5 h-3.5" /> 选择
          </Button>
          <Button onClick={() => scan()} disabled={scanning || !path}>
            {scanning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            扫描
          </Button>
        </Card>

        {/* A. Overview bar */}
        <OverviewBar stats={stats} scanning={scanning} />

        {/* B. Smart Clean */}
        <SmartClean
          caches={caches}
          trash={trash}
          oldDownloads={oldDownloads}
          downloadsPath={downloadsPath}
          onDone={() => {
            refreshCleanup();
            if (downloadsPath) {
              api.oldFilesIn(downloadsPath, 30).then(setOldDownloads).catch(() => {});
            }
          }}
        />

        {/* C. Categories */}
        <CategoryGrid stats={stats} scanning={scanning} />

        {/* D. Smart Lists */}
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
          <OldestFiles
            files={stats?.oldest || []}
            scanning={scanning}
            onAfterArchive={(p) =>
              setStats((s) =>
                s ? { ...s, oldest: s.oldest.filter((f) => f.path !== p) } : s
              )
            }
          />
          <DuplicatesCard
            count={stats?.potential_dupes ?? 0}
            scanning={scanning}
            onClick={() => navigate("/duplicates")}
          />
        </div>

        {/* E. Auto rules */}
        <AutoRules
          autoEmptyTrash={autoEmptyTrash}
          autoClearDownloads={autoClearDownloads}
          weeklyScan={weeklyScan}
          onChange={(k, v) => {
            if (k === "trash") {
              setAutoEmptyTrash(v);
              api.setSetting("storage.auto_empty_trash", v);
            } else if (k === "downloads") {
              setAutoClearDownloads(v);
              api.setSetting("storage.auto_clear_downloads", v);
            } else if (k === "weekly") {
              setWeeklyScan(v);
              api.setSetting("storage.weekly_scan", v);
            }
          }}
        />
      </div>
    </div>
  );
}

// ---------- A. Overview bar ----------

function OverviewBar({
  stats,
  scanning,
}: {
  stats: FolderStats | null;
  scanning: boolean;
}) {
  const buckets = useMemo(
    () => (stats ? bucketize(stats.by_extension) : emptyBuckets()),
    [stats]
  );
  const total = stats?.total_bytes || 0;

  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between mb-3">
        <div className="font-medium text-sm flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-primary" />
          扫描结果概览
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {scanning ? "扫描中…" : stats ? `${formatBytes(total)} · ${stats.total_files.toLocaleString()} 个文件` : "等待扫描"}
        </div>
      </div>
      <div className="h-3 rounded-full bg-secondary overflow-hidden flex">
        {CATEGORY_META.map((c) => {
          const pct = total > 0 ? (buckets[c.id].bytes / total) * 100 : 0;
          if (pct < 0.5) return null;
          return (
            <div
              key={c.id}
              className={cn("bg-gradient-to-b", c.color, "h-full")}
              style={{ width: `${pct}%` }}
              title={`${c.label} · ${formatBytes(buckets[c.id].bytes)}`}
            />
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        {CATEGORY_META.map((c) => (
          <div key={c.id} className="flex items-center gap-1.5">
            <span className={cn("w-2 h-2 rounded-sm bg-gradient-to-b", c.color)} />
            <span className="text-muted-foreground">{c.label}</span>
            <span className="tabular-nums">{formatBytes(buckets[c.id].bytes)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---------- B. Smart Clean ----------

interface CleanItem {
  key: string;
  label: string;
  detail: string;
  size: number;
  defaultChecked: boolean;
  run: () => Promise<number>; // returns bytes freed
}

function SmartClean({
  caches,
  trash,
  oldDownloads,
  downloadsPath,
  onDone,
}: {
  caches: CacheDir[];
  trash: TrashStats | null;
  oldDownloads: OldFilesReport | null;
  downloadsPath: string;
  onDone: () => void;
}) {
  const items: CleanItem[] = useMemo(() => {
    const arr: CleanItem[] = [];
    const cacheTotal = caches.reduce((s, c) => s + c.size, 0);
    if (cacheTotal > 0) {
      arr.push({
        key: "cache",
        label: "系统缓存",
        detail: `${caches.length} 个缓存目录`,
        size: cacheTotal,
        defaultChecked: true,
        run: async () => {
          let freed = 0;
          for (const c of caches) {
            try {
              freed += await api.clearCacheDir(c.path);
            } catch (e) {
              console.warn("clear cache failed for", c.path, e);
            }
          }
          return freed;
        },
      });
    }
    if (trash && trash.size > 0) {
      arr.push({
        key: "trash",
        label: "回收站",
        detail: `${trash.item_count} 项`,
        size: trash.size,
        defaultChecked: true,
        run: async () => {
          await api.emptyTrash();
          return trash.size;
        },
      });
    }
    if (oldDownloads && oldDownloads.size > 0 && downloadsPath) {
      arr.push({
        key: "downloads",
        label: "30 天前的下载",
        detail: `${oldDownloads.item_count} 项 · 移到回收站可恢复`,
        size: oldDownloads.size,
        defaultChecked: false, // conservative default
        run: async () => api.clearOldFilesIn(downloadsPath, 30),
      });
    }
    return arr;
  }, [caches, trash, oldDownloads, downloadsPath]);

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);

  // Re-init checks when items change
  useEffect(() => {
    setChecked(new Set(items.filter((i) => i.defaultChecked).map((i) => i.key)));
  }, [items]);

  const willFree = items
    .filter((i) => checked.has(i.key))
    .reduce((s, i) => s + i.size, 0);

  const run = async () => {
    if (checked.size === 0) return;
    if (!confirm(`确定执行清理？预计释放 ${formatBytes(willFree)}`)) return;
    setRunning(true);
    let freed = 0;
    try {
      for (const i of items) {
        if (!checked.has(i.key)) continue;
        try {
          freed += await i.run();
        } catch (e) {
          console.warn("clean step failed", i.key, e);
        }
      }
      toast(`清理完成，释放 ${formatBytes(freed)}`, "success");
      onDone();
    } finally {
      setRunning(false);
    }
  };

  if (items.length === 0) {
    return (
      <Card className="p-5 bg-emerald-500/5 border-emerald-500/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <div className="font-medium">很干净 ✨</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              暂无可清理的缓存 / 回收站 / 旧下载文件
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
          <Zap className="w-5 h-5 text-primary-foreground" />
        </div>
        <div className="flex-1">
          <div className="font-medium">一键智能清理</div>
          <div className="text-xs text-muted-foreground">
            勾选后点「立即清理」，预计释放{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {formatBytes(willFree)}
            </span>
          </div>
        </div>
        <Button onClick={run} disabled={running || checked.size === 0}>
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
          立即清理
        </Button>
      </div>
      <div className="space-y-1">
        {items.map((it) => {
          const isChecked = checked.has(it.key);
          return (
            <label
              key={it.key}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors",
                isChecked ? "border-primary/40 bg-primary/5" : "border-border bg-secondary/30 hover:bg-accent/40"
              )}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={(e) => {
                  setChecked((prev) => {
                    const n = new Set(prev);
                    if (e.target.checked) n.add(it.key);
                    else n.delete(it.key);
                    return n;
                  });
                }}
                className="accent-primary"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{it.label}</div>
                <div className="text-[11px] text-muted-foreground truncate">{it.detail}</div>
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatBytes(it.size)}
              </span>
            </label>
          );
        })}
      </div>
    </Card>
  );
}

// ---------- C. Categories ----------

function CategoryGrid({
  stats,
  scanning,
}: {
  stats: FolderStats | null;
  scanning: boolean;
}) {
  const buckets = useMemo(
    () => (stats ? bucketize(stats.by_extension) : emptyBuckets()),
    [stats]
  );
  const total = stats?.total_bytes || 0;
  return (
    <div>
      <div className="text-sm font-medium text-muted-foreground mb-3">分类导览</div>
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {CATEGORY_META.map((c) => {
          const b = buckets[c.id];
          const pct = total > 0 ? (b.bytes / total) * 100 : 0;
          return (
            <Card key={c.id} className="p-3">
              <div className={cn("w-9 h-9 rounded-xl bg-gradient-to-br flex items-center justify-center mb-2", c.color)}>
                <c.icon className="w-4 h-4 text-white" />
              </div>
              <div className="text-sm font-medium">{c.label}</div>
              <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                {scanning ? "—" : `${formatBytes(b.bytes)} · ${b.count}`}
              </div>
              {!scanning && total > 0 && (
                <div className="mt-2 h-1 rounded-full bg-secondary overflow-hidden">
                  <div className={cn("h-full bg-gradient-to-r", c.color)} style={{ width: `${pct}%` }} />
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ---------- D. Smart Lists ----------

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
      <List empty={files.length === 0} scanning={scanning} emptyText="选目录扫描后显示">
        {files.slice(0, 10).map((f) => (
          <div key={f.path} className="flex items-center gap-2.5 py-1.5 group">
            <FileIcon name={f.name} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{f.name}</div>
              <div className="text-[10px] text-muted-foreground truncate">{f.path}</div>
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">{formatBytes(f.size)}</span>
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
      <SectionTitle icon={Archive} title="久未访问 Top 10" subtitle="按修改时间升序" />
      <List empty={files.length === 0} scanning={scanning} emptyText="选目录扫描后显示">
        {files.slice(0, 10).map((f) => (
          <div key={f.path} className="flex items-center gap-2.5 py-1.5 group">
            <FileIcon name={f.name} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{f.name}</div>
              <div className="text-[10px] text-muted-foreground">{formatTime(f.modified)}</div>
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
      <SectionTitle icon={AlertTriangle} title="重复文件" subtitle="基于大小快速估算" />
      <div className="flex items-end gap-3 mt-3">
        <div className="text-3xl font-semibold tabular-nums">
          {scanning ? "—" : count}
        </div>
        <div className="text-xs text-muted-foreground pb-1.5">个疑似重复</div>
      </div>
      <Button variant="outline" size="sm" className="w-full mt-3" onClick={onClick}>
        精确扫描（SHA-256）→
      </Button>
    </Card>
  );
}

// ---------- E. Auto rules ----------

function AutoRules({
  autoEmptyTrash,
  autoClearDownloads,
  weeklyScan,
  onChange,
}: {
  autoEmptyTrash: boolean;
  autoClearDownloads: boolean;
  weeklyScan: boolean;
  onChange: (key: "trash" | "downloads" | "weekly", value: boolean) => void;
}) {
  return (
    <Card className="p-5">
      <SectionTitle icon={Wand2} title="自动清理规则" subtitle="应用打开时生效" />
      <div className="text-[11px] text-muted-foreground mt-1">
        当前版本由「应用启动时检查一次」执行；后台定时调度后续会接入。
      </div>
      <div className="mt-4 space-y-2">
        <Toggle
          icon={Eraser}
          label="自动清空 30 天前的回收站"
          checked={autoEmptyTrash}
          onChange={(v) => onChange("trash", v)}
        />
        <Toggle
          icon={Download}
          label="自动清理 60 天前的下载"
          checked={autoClearDownloads}
          onChange={(v) => onChange("downloads", v)}
        />
        <Toggle
          icon={RefreshCw}
          label="每周自动扫描并提示"
          checked={weeklyScan}
          onChange={(v) => onChange("weekly", v)}
        />
      </div>
    </Card>
  );
}

function Toggle({
  icon: Icon,
  label,
  checked,
  onChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors text-left",
        checked ? "border-primary/40 bg-primary/5" : "border-border bg-secondary/30 hover:bg-accent/40"
      )}
    >
      <Icon className={cn("w-4 h-4", checked ? "text-primary" : "text-muted-foreground")} />
      <span className="flex-1 text-sm">{label}</span>
      <span
        className={cn(
          "w-9 h-5 rounded-full relative transition-colors",
          checked ? "bg-primary" : "bg-muted-foreground/30"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all",
            checked ? "left-4" : "left-0.5"
          )}
        />
      </span>
    </button>
  );
}

// ---------- shared ----------

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
            <div className="text-base font-semibold tabular-nums">{Math.round(percent)}%</div>
            <div className="text-[9px] text-muted-foreground">{formatBytes(disk.used)}</div>
          </div>
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground text-center mt-1 tabular-nums">
        可用 {formatBytes(disk.available)} / {formatBytes(disk.total)}
      </div>
    </Card>
  );
}

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
      <div className={cn("text-xs text-muted-foreground py-6 text-center")}>{emptyText}</div>
    );
  }
  return <div className="mt-2">{children}</div>;
}
