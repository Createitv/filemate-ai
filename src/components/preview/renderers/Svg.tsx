import { useState } from "react";
import { CodeRenderer } from "./Code";
import { convertFileSrc } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";

export function SvgRenderer({ path, text }: { path: string; text?: string }) {
  const [tab, setTab] = useState<"render" | "source" | "split">("split");
  const url = convertFileSrc(path);

  return (
    <div className="w-full h-full flex flex-col bg-background">
      <div className="px-4 py-2 border-b border-border/40 flex items-center gap-2">
        {(["render", "source", "split"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-3 py-1 text-xs rounded-md",
              tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent/40"
            )}
          >
            {t === "render" ? "渲染" : t === "source" ? "源码" : "并排"}
          </button>
        ))}
      </div>
      <div className="flex-1 flex overflow-hidden">
        {(tab === "render" || tab === "split") && (
          <div className="flex-1 flex items-center justify-center bg-[radial-gradient(circle_at_center,#1f2937,#0b0e14)]">
            <img src={url} alt="" className="max-w-[90%] max-h-[90%]" />
          </div>
        )}
        {(tab === "source" || tab === "split") && text && (
          <div className="flex-1 min-w-0 border-l border-border/40">
            <CodeRenderer text={text} language="xml" />
          </div>
        )}
      </div>
    </div>
  );
}
