import { useEffect, useRef, useState } from "react";
import type { Histogram as HistData } from "@/api/types";
import { cn } from "@/lib/utils";

type Channel = "rgb" | "luminance" | "r" | "g" | "b";

export function Histogram({ data }: { data: HistData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [channel, setChannel] = useState<Channel>("rgb");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const w = rect.width;
    const h = rect.height;

    const draw = (vals: number[], color: string) => {
      const max = Math.max(...vals, 1);
      ctx.fillStyle = color;
      const step = w / vals.length;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let i = 0; i < vals.length; i++) {
        const v = (vals[i] / max) * (h - 4);
        ctx.lineTo(i * step, h - v);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    };

    ctx.globalCompositeOperation = "lighter";
    if (channel === "rgb") {
      draw(data.r, "rgba(239, 68, 68, 0.7)");
      draw(data.g, "rgba(34, 197, 94, 0.7)");
      draw(data.b, "rgba(59, 130, 246, 0.7)");
    } else if (channel === "r") draw(data.r, "rgba(239, 68, 68, 0.85)");
    else if (channel === "g") draw(data.g, "rgba(34, 197, 94, 0.85)");
    else if (channel === "b") draw(data.b, "rgba(59, 130, 246, 0.85)");
    else draw(data.luminance, "rgba(120, 120, 120, 0.85)");
  }, [data, channel]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {(["rgb", "luminance", "r", "g", "b"] as Channel[]).map((c) => (
          <button
            key={c}
            onClick={() => setChannel(c)}
            className={cn(
              "px-2 py-1 rounded-md text-[11px] border",
              channel === c
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-accent/40"
            )}
          >
            {c === "rgb" ? "RGB" : c === "luminance" ? "亮度" : c.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="rounded-lg border border-border bg-muted/30 p-2">
        <canvas ref={canvasRef} className="w-full h-32" />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>0</span>
          <span>128</span>
          <span>255</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <Stat label="平均" value={mean(data.luminance)} />
        <Stat label="峰值" value={argMax(data.luminance)} />
        <Stat label="对比" value={contrast(data.luminance)} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-muted/40 px-2 py-1.5">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function mean(vals: number[]) {
  let total = 0;
  let weighted = 0;
  for (let i = 0; i < vals.length; i++) {
    total += vals[i];
    weighted += vals[i] * i;
  }
  return total === 0 ? 0 : Math.round(weighted / total);
}
function argMax(vals: number[]) {
  let max = 0;
  let idx = 0;
  for (let i = 0; i < vals.length; i++) if (vals[i] > max) ((max = vals[i]), (idx = i));
  return idx;
}
function contrast(vals: number[]) {
  const m = mean(vals);
  let sum = 0;
  let n = 0;
  for (let i = 0; i < vals.length; i++) {
    sum += vals[i] * (i - m) * (i - m);
    n += vals[i];
  }
  return n === 0 ? 0 : Math.round(Math.sqrt(sum / n));
}
