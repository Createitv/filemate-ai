// "Open With..." dropdown + modal. Loads installed applications lazily, lets
// the user pick one, and on Windows surfaces the native OpenAs dialog as a
// fallback. The dropdown variant is for inline header use; the modal variant
// is for triggering from menus that close on click.

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ExternalLink, FolderOpen, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import * as api from "@/api";
import type { AppInfo } from "@/api/types";
import { Input } from "@/components/ui/input";
import { toastError } from "@/components/ui/toast";

// Module-scoped cache so icons persist across reopen / Panel <-> DialogBody.
const iconCache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

function fetchIcon(id: string): Promise<string | null> {
  if (iconCache.has(id)) return Promise.resolve(iconCache.get(id) ?? null);
  const existing = inflight.get(id);
  if (existing) return existing;
  const p = api
    .getAppIcon(id)
    .then((v) => {
      iconCache.set(id, v ?? null);
      inflight.delete(id);
      return v ?? null;
    })
    .catch(() => {
      iconCache.set(id, null);
      inflight.delete(id);
      return null;
    });
  inflight.set(id, p);
  return p;
}

function AppIcon({ app, size = 20 }: { app: AppInfo; size?: number }) {
  const [src, setSrc] = useState<string | null>(() => iconCache.get(app.id) ?? null);
  useEffect(() => {
    let active = true;
    if (!iconCache.has(app.id)) {
      fetchIcon(app.id).then((v) => {
        if (active) setSrc(v);
      });
    }
    return () => {
      active = false;
    };
  }, [app.id]);
  const dim = { width: size, height: size };
  if (src) {
    return (
      <img
        src={src}
        alt=""
        style={dim}
        className="rounded shrink-0 object-contain"
      />
    );
  }
  return (
    <span
      style={dim}
      className="rounded bg-gradient-to-br from-primary/40 to-primary/10 flex items-center justify-center uppercase font-bold text-primary shrink-0"
    >
      <span style={{ fontSize: Math.max(9, Math.round(size * 0.5)) }}>
        {app.name[0]}
      </span>
    </span>
  );
}

export function OpenWithMenu({
  path,
  className,
  variant = "button",
}: {
  path: string;
  className?: string;
  variant?: "button" | "icon";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      {variant === "button" ? (
        <button
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "h-7 inline-flex items-center gap-1.5 px-2.5 rounded-md text-xs text-foreground/80 hover:bg-accent/40",
            className
          )}
        >
          <ExternalLink className="w-3.5 h-3.5" />
          打开方式
          <ChevronDown className="w-3 h-3" />
        </button>
      ) : (
        <button
          onClick={() => setOpen((o) => !o)}
          title="打开方式"
          className={cn(
            "w-7 h-7 rounded-md text-muted-foreground hover:bg-accent/40 hover:text-foreground flex items-center justify-center",
            className
          )}
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      )}
      {open && (
        <Panel
          path={path}
          onClose={() => setOpen(false)}
          align="right"
        />
      )}
    </div>
  );
}

function Panel({
  path,
  onClose,
  align,
}: {
  path: string;
  onClose: () => void;
  align: "left" | "right";
}) {
  const [apps, setApps] = useState<AppInfo[] | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    api
      .listInstalledApps()
      .then(setApps)
      .catch((e) => {
        toastError(e);
        setApps([]);
      });
  }, []);

  const filtered = (apps || []).filter((a) =>
    a.name.toLowerCase().includes(filter.toLowerCase())
  );

  const launch = async (app: AppInfo) => {
    try {
      await api.openWith(path, app.id);
      onClose();
    } catch (e) {
      toastError(e);
    }
  };

  const systemDialog = async () => {
    try {
      await api.openWithDialog(path);
      onClose();
    } catch (e) {
      toastError(e);
    }
  };

  const reveal = async () => {
    try {
      await api.revealInFolder(path);
      onClose();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <div
      className={cn(
        "absolute z-50 mt-1.5 w-72 rounded-xl bg-card border border-border shadow-xl overflow-hidden",
        align === "right" ? "right-0" : "left-0"
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-2 border-b border-border/40 flex items-center gap-2">
        <Search className="w-3.5 h-3.5 text-muted-foreground" />
        <Input
          autoFocus
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="搜索应用…"
          className="h-7 px-0 border-0 focus-visible:ring-0 bg-transparent text-xs"
        />
      </div>
      <div className="max-h-80 overflow-y-auto scrollbar-thin py-1">
        {apps === null && (
          <div className="flex items-center justify-center py-6 text-xs text-muted-foreground gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> 扫描已安装应用…
          </div>
        )}
        {apps !== null && filtered.length === 0 && (
          <div className="px-3 py-6 text-xs text-muted-foreground text-center">
            没有匹配的应用
          </div>
        )}
        {filtered.map((a) => (
          <button
            key={a.id}
            onClick={() => launch(a)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent/60"
          >
            <AppIcon app={a} size={20} />
            <span className="flex-1 text-left truncate">{a.name}</span>
          </button>
        ))}
      </div>
      <div className="border-t border-border/40 py-1">
        <button
          onClick={systemDialog}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent/60"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          系统「打开方式」对话框…
        </button>
        <button
          onClick={reveal}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent/60"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          在 {platformFileManager()} 中显示
        </button>
      </div>
    </div>
  );
}

/** Centered modal version, suitable for triggering from context menus. */
export function OpenWithDialog({
  path,
  onClose,
}: {
  path: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-card rounded-2xl shadow-2xl border border-border/60 overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
          <ExternalLink className="w-4 h-4 text-primary" />
          <div className="text-sm font-medium">用其他应用打开</div>
          <div className="ml-auto text-[11px] text-muted-foreground truncate max-w-[180px]">
            {path.split(/[\\/]/).pop()}
          </div>
        </div>
        <DialogBody path={path} onClose={onClose} />
      </div>
    </div>
  );
}

function DialogBody({ path, onClose }: { path: string; onClose: () => void }) {
  const [apps, setApps] = useState<AppInfo[] | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    api
      .listInstalledApps()
      .then(setApps)
      .catch((e) => {
        toastError(e);
        setApps([]);
      });
  }, []);

  const filtered = (apps || []).filter((a) =>
    a.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <>
      <div className="px-4 py-2 border-b border-border/40 flex items-center gap-2">
        <Search className="w-3.5 h-3.5 text-muted-foreground" />
        <Input
          autoFocus
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="搜索应用…"
          className="h-7 px-0 border-0 focus-visible:ring-0 bg-transparent text-xs"
        />
      </div>
      <div className="max-h-[50vh] overflow-y-auto scrollbar-thin py-1">
        {apps === null && (
          <div className="flex items-center justify-center py-10 text-xs text-muted-foreground gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> 扫描已安装应用…
          </div>
        )}
        {apps !== null && filtered.length === 0 && (
          <div className="px-3 py-10 text-xs text-muted-foreground text-center">
            没有匹配的应用
          </div>
        )}
        {filtered.map((a) => (
          <button
            key={a.id}
            onClick={async () => {
              try {
                await api.openWith(path, a.id);
                onClose();
              } catch (e) {
                toastError(e);
              }
            }}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-accent/60"
          >
            <AppIcon app={a} size={24} />
            <span className="flex-1 text-left truncate">{a.name}</span>
            <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
              {a.path}
            </span>
          </button>
        ))}
      </div>
      <div className="border-t border-border/40 py-1">
        <button
          onClick={async () => {
            try {
              await api.openWithDialog(path);
              onClose();
            } catch (e) {
              toastError(e);
            }
          }}
          className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-accent/60"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          系统「打开方式」对话框…
        </button>
      </div>
    </>
  );
}

function platformFileManager(): string {
  const ua = navigator.userAgent;
  if (/Mac/.test(ua)) return "Finder";
  if (/Windows/.test(ua)) return "资源管理器";
  return "文件管理器";
}
