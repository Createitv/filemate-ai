import { useEffect, useState } from "react";
import { Folder, FileText, Loader2 } from "lucide-react";
import * as api from "@/api";
import { formatBytes } from "@/lib/format";

interface Entry {
  name: string;
  size: number;
  compressed_size: number;
  is_dir: boolean;
}

interface Node {
  name: string;
  isDir: boolean;
  size: number;
  children: Map<string, Node>;
}

export function ArchiveRenderer({ path }: { path: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set([""]));

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .listZip(path)
      .then((es) => setEntries(es as Entry[]))
      .catch((e) => setError(String(e?.message || e)))
      .finally(() => setLoading(false));
  }, [path]);

  const tree = buildTree(entries);

  return (
    <div className="w-full h-full overflow-y-auto bg-card p-4 scrollbar-thin">
      <div className="text-xs text-muted-foreground mb-3">
        {entries.length} 项 · 总大小 {formatBytes(entries.reduce((s, e) => s + e.size, 0))}
      </div>
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          读取压缩包…
        </div>
      )}
      {error && (
        <div className="text-sm text-rose-500">读取失败：{error}（仅支持 zip；rar/7z 需系统命令）</div>
      )}
      {!loading && !error && (
        <TreeView node={tree} prefix="" expanded={expanded} setExpanded={setExpanded} />
      )}
    </div>
  );
}

function TreeView({
  node,
  prefix,
  expanded,
  setExpanded,
}: {
  node: Node;
  prefix: string;
  expanded: Set<string>;
  setExpanded: (s: Set<string>) => void;
}) {
  const children = Array.from(node.children.values()).sort((a, b) =>
    a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1
  );
  return (
    <div>
      {children.map((c) => {
        const key = prefix + "/" + c.name;
        const isOpen = expanded.has(key);
        return (
          <div key={key}>
            <div
              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent/40 cursor-pointer text-sm"
              onClick={() => {
                if (!c.isDir) return;
                const next = new Set(expanded);
                if (isOpen) next.delete(key);
                else next.add(key);
                setExpanded(next);
              }}
            >
              <span className="w-3 text-muted-foreground text-xs">
                {c.isDir ? (isOpen ? "▾" : "▸") : ""}
              </span>
              {c.isDir ? (
                <Folder className="w-3.5 h-3.5 text-blue-500" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-muted-foreground" />
              )}
              <span className="flex-1 truncate">{c.name}</span>
              <span className="text-xs text-muted-foreground">
                {c.isDir ? "" : formatBytes(c.size)}
              </span>
            </div>
            {isOpen && c.isDir && (
              <div className="ml-4 border-l border-border/40 pl-2">
                <TreeView node={c} prefix={key} expanded={expanded} setExpanded={setExpanded} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function buildTree(entries: Entry[]): Node {
  const root: Node = { name: "", isDir: true, size: 0, children: new Map() };
  for (const e of entries) {
    const parts = e.name.split("/").filter(Boolean);
    let cursor = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const isDir = e.is_dir || !isLast;
      if (!cursor.children.has(part)) {
        cursor.children.set(part, {
          name: part,
          isDir,
          size: isLast ? e.size : 0,
          children: new Map(),
        });
      }
      cursor = cursor.children.get(part)!;
    }
  }
  return root;
}
