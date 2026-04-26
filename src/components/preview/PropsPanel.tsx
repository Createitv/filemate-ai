import { useState } from "react";
import type { PreviewMeta } from "@/api/types";
import { formatBytes, formatTime } from "@/lib/format";
import { Histogram } from "./Histogram";
import { cn } from "@/lib/utils";

interface Props {
  path: string;
  meta: PreviewMeta;
}

type Tab = "basic" | "details" | "exif" | "histogram";

export function PropsPanel({ path, meta }: Props) {
  const tabs = availableTabs(meta);
  const [tab, setTab] = useState<Tab>(tabs[0]);

  return (
    <div className="w-80 shrink-0 border-l border-border/60 flex flex-col bg-card">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border/40 bg-background/40">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-3 py-1.5 text-xs rounded-lg",
              tab === t
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent/40"
            )}
          >
            {label(t)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3 text-sm">
        {tab === "basic" && <BasicInfo path={path} meta={meta} />}
        {tab === "details" && <DetailsInfo path={path} meta={meta} />}
        {tab === "exif" && <ExifInfo meta={meta} />}
        {tab === "histogram" && <HistogramInfo meta={meta} />}
      </div>
    </div>
  );
}

function availableTabs(meta: PreviewMeta): Tab[] {
  const tabs: Tab[] = ["basic", "details"];
  if (meta.extras?.kind === "image") {
    tabs.push("exif", "histogram");
  }
  return tabs;
}

function label(t: Tab): string {
  switch (t) {
    case "basic":
      return "基本信息";
    case "details":
      return "详细信息";
    case "exif":
      return "EXIF";
    case "histogram":
      return "色彩直方图";
  }
}

function Row({ k, v }: { k: string; v?: string | number | null }) {
  if (v === undefined || v === null || v === "") return null;
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-border/40 last:border-0">
      <span className="text-muted-foreground w-24 shrink-0 text-xs">{k}</span>
      <span className="flex-1 text-xs break-all font-mono">{String(v)}</span>
    </div>
  );
}

function BasicInfo({ path, meta }: { path: string; meta: PreviewMeta }) {
  const ex = meta.extras;
  return (
    <div>
      <Row k="文件名" v={path.split(/[\\/]/).pop()} />
      <Row k="大小" v={formatBytes(meta.size)} />
      <Row k="类型" v={meta.kind} />
      <Row k="MIME" v={meta.mime} />
      <Row k="扩展名" v={meta.extension ? `.${meta.extension}` : undefined} />
      <Row k="修改时间" v={meta.modified ? formatTime(meta.modified) : undefined} />
      <Row k="创建时间" v={meta.created ? formatTime(meta.created) : undefined} />
      {ex?.kind === "image" && (
        <>
          <Row k="尺寸" v={`${ex.width} × ${ex.height}`} />
          <Row k="色彩模式" v={ex.color} />
        </>
      )}
      {ex?.kind === "audio" && (
        <>
          <Row k="时长" v={formatDuration(ex.duration_ms)} />
          <Row k="比特率" v={ex.bitrate ? `${ex.bitrate} kbps` : undefined} />
          <Row k="采样率" v={ex.sample_rate ? `${(ex.sample_rate / 1000).toFixed(1)} kHz` : undefined} />
          <Row k="声道" v={ex.channels} />
        </>
      )}
      {ex?.kind === "font" && (
        <>
          <Row k="字体名" v={ex.full_name || ex.family} />
          <Row k="字族" v={ex.family} />
          <Row k="样式" v={ex.subfamily} />
          <Row k="格式" v={ex.format} />
        </>
      )}
    </div>
  );
}

function DetailsInfo({ path, meta }: { path: string; meta: PreviewMeta }) {
  const ex = meta.extras;
  return (
    <div>
      <Row k="完整路径" v={path} />
      {ex?.kind === "image" && (
        <>
          <Row k="像素总数" v={(ex.width * ex.height).toLocaleString()} />
          <Row k="宽高比" v={(ex.width / ex.height).toFixed(3)} />
        </>
      )}
      {ex?.kind === "audio" && (
        <>
          <Row k="标题" v={ex.title} />
          <Row k="艺术家" v={ex.artist} />
          <Row k="专辑" v={ex.album} />
          <Row k="专辑艺术家" v={ex.album_artist} />
          <Row k="年份" v={ex.year} />
          <Row k="音轨" v={ex.track} />
          <Row k="风格" v={ex.genre} />
          <Row k="格式" v={ex.format} />
        </>
      )}
      {ex?.kind === "font" && (
        <>
          <Row k="版本" v={ex.version} />
          <Row k="厂商" v={ex.manufacturer} />
          <Row k="设计师" v={ex.designer} />
          <Row k="字形数" v={ex.num_glyphs} />
          <Row k="版权" v={ex.copyright} />
        </>
      )}
      {meta.kind === "code" && <Row k="语言" v={meta.language} />}
    </div>
  );
}

function ExifInfo({ meta }: { meta: PreviewMeta }) {
  if (meta.extras?.kind !== "image") return <div className="text-muted-foreground">无 EXIF</div>;
  const ex = meta.extras;
  if (ex.exif.length === 0) {
    return <div className="text-muted-foreground text-xs">此图片不包含 EXIF 信息</div>;
  }
  return (
    <div>
      {ex.exif.map((e, i) => (
        <Row key={i} k={prettyTag(e.tag)} v={e.value} />
      ))}
    </div>
  );
}

function HistogramInfo({ meta }: { meta: PreviewMeta }) {
  if (meta.extras?.kind !== "image") return null;
  return <Histogram data={meta.extras.histogram} />;
}

function prettyTag(tag: string): string {
  const map: Record<string, string> = {
    Make: "相机品牌",
    Model: "相机型号",
    LensModel: "镜头",
    DateTimeOriginal: "拍摄时间",
    DateTime: "修改时间",
    ExposureTime: "快门",
    FNumber: "光圈",
    ISOSpeed: "ISO",
    FocalLength: "焦距",
    FocalLengthIn35mmFilm: "等效 35mm",
    Flash: "闪光灯",
    WhiteBalance: "白平衡",
    ExposureBiasValue: "曝光补偿",
    PixelXDimension: "像素宽",
    PixelYDimension: "像素高",
    Orientation: "方向",
    ColorSpace: "色彩空间",
    Software: "软件",
    Artist: "作者",
    Copyright: "版权",
    GPSLatitude: "纬度",
    GPSLongitude: "经度",
    GPSAltitude: "海拔",
  };
  return map[tag] || tag;
}

function formatDuration(ms: number): string {
  if (!ms) return "—";
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}
