// Audio renderer: native <audio> with a real waveform painted from the
// decoded buffer (Web Audio API). Falls back to a flat baseline if the
// browser cannot decode the format (rare for the audio types we support).

import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Music, Loader2 } from "lucide-react";
import type { AudioMeta } from "@/api/types";

export function AudioRenderer({ path, meta }: { path: string; meta?: AudioMeta }) {
  const url = convertFileSrc(path);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then(async (buf) => {
        if (cancelled) return;
        const ctx = new AudioContext();
        const decoded = await ctx.decodeAudioData(buf.slice(0));
        const channel = decoded.getChannelData(0);
        drawWaveform(canvasRef.current, channel);
        ctx.close();
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-violet-950 via-slate-950 to-slate-900 text-white p-8">
      <div className="w-32 h-32 rounded-3xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-2xl">
        <Music className="w-16 h-16" />
      </div>
      <div className="text-center">
        <div className="text-xl font-semibold">{meta?.title || path.split(/[\\/]/).pop()}</div>
        {meta?.artist && <div className="text-sm text-white/60 mt-1">{meta.artist}</div>}
        {meta?.album && <div className="text-xs text-white/40 mt-0.5">{meta.album}</div>}
      </div>

      <div className="w-full max-w-2xl rounded-2xl bg-white/5 backdrop-blur p-4 space-y-3">
        <div className="relative h-24 rounded-lg overflow-hidden bg-black/40">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-white/50">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          )}
          <canvas ref={canvasRef} className="w-full h-full" />
          <div
            className="absolute inset-y-0 left-0 bg-primary/30 pointer-events-none"
            style={{ width: `${progress}%` }}
          />
        </div>
        <audio
          ref={audioRef}
          src={url}
          controls
          className="w-full"
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            if (el.duration) setProgress((el.currentTime / el.duration) * 100);
          }}
        />
      </div>
    </div>
  );
}

function drawWaveform(canvas: HTMLCanvasElement | null, samples: Float32Array) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const buckets = Math.floor(rect.width / 2);
  const blockSize = Math.floor(samples.length / buckets);
  const data = new Array(buckets);
  for (let i = 0; i < buckets; i++) {
    let max = 0;
    for (let j = 0; j < blockSize; j++) {
      const v = Math.abs(samples[i * blockSize + j] || 0);
      if (v > max) max = v;
    }
    data[i] = max;
  }

  const grad = ctx.createLinearGradient(0, 0, 0, rect.height);
  grad.addColorStop(0, "rgba(168, 85, 247, 0.9)");
  grad.addColorStop(1, "rgba(99, 102, 241, 0.9)");
  ctx.fillStyle = grad;
  const mid = rect.height / 2;
  for (let i = 0; i < buckets; i++) {
    const h = data[i] * (rect.height - 4);
    ctx.fillRect(i * 2, mid - h / 2, 1.4, h);
  }
}
