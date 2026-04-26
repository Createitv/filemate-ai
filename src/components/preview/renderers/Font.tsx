// Loads the font file via @font-face (the font is served by Tauri's asset
// protocol) so the user can see the actual glyphs. Lets them type custom
// preview text and tune size / weight.

import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Input } from "@/components/ui/input";
import type { FontMeta } from "@/api/types";

export function FontRenderer({ path, meta }: { path: string; meta?: FontMeta }) {
  const [size, setSize] = useState(48);
  const [text, setText] = useState(
    "FileMate AI 让文件管理更智能 — The quick brown fox jumps over the lazy dog 0123456789"
  );
  const familyName = `filemate-${btoa(path).slice(0, 12).replace(/[^a-z0-9]/gi, "")}`;

  useEffect(() => {
    const url = convertFileSrc(path);
    const style = document.createElement("style");
    style.textContent = `@font-face { font-family: '${familyName}'; src: url('${url}'); }`;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, [path, familyName]);

  return (
    <div className="w-full h-full flex flex-col bg-background p-6 gap-4 overflow-y-auto scrollbar-thin">
      <div className="rounded-2xl bg-card border border-border/60 p-4 space-y-3">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="输入预览文字" />
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-12">大小</span>
          <input
            type="range"
            min={12}
            max={144}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="flex-1"
          />
          <span className="text-xs tabular-nums w-12 text-right">{size}px</span>
        </div>
      </div>

      <div
        className="flex-1 rounded-2xl bg-card border border-border/60 p-8 break-words leading-snug"
        style={{ fontFamily: `'${familyName}', sans-serif`, fontSize: `${size}px` }}
      >
        {text}
      </div>

      {meta && (
        <div className="grid grid-cols-2 gap-4 text-xs">
          {[
            ["字族", meta.family],
            ["样式", meta.subfamily],
            ["完整名称", meta.full_name],
            ["格式", meta.format],
            ["版本", meta.version],
            ["字形数", meta.num_glyphs?.toString()],
            ["设计师", meta.designer],
            ["厂商", meta.manufacturer],
          ]
            .filter(([, v]) => !!v)
            .map(([k, v]) => (
              <div key={k} className="flex gap-2 rounded-lg bg-card border border-border/60 px-3 py-2">
                <span className="text-muted-foreground w-16">{k}</span>
                <span className="flex-1 break-all">{v}</span>
              </div>
            ))}
        </div>
      )}

      <Glyphs family={familyName} size={32} />
    </div>
  );
}

function Glyphs({ family, size }: { family: string; size: number }) {
  const ranges = [
    { label: "Aa", chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz" },
    { label: "0-9", chars: "0123456789" },
    { label: "符号", chars: "!@#$%^&*()_+-=[]{}|;:'\",.<>/?`~" },
    { label: "中文", chars: "永和九年岁在癸丑暮春之初会于会稽山阴之兰亭" },
  ];
  return (
    <div className="space-y-3">
      {ranges.map((r) => (
        <div key={r.label} className="rounded-2xl bg-card border border-border/60 p-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            {r.label}
          </div>
          <div
            className="flex flex-wrap gap-1.5"
            style={{ fontFamily: `'${family}', sans-serif`, fontSize: `${size}px` }}
          >
            {Array.from(r.chars).map((c, i) => (
              <span
                key={i}
                className="w-12 h-12 flex items-center justify-center rounded-md bg-muted/40"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
