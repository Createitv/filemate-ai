// Colorful file-type icon, like the brand badges in the design mock.
// Auto-detects from extension/mime: folder, pdf, word, excel, ppt, image
// (with thumbnail when possible), video, audio, archive, code, markdown,
// font, text. Falls back to a neutral "file" badge with the extension.
//
// Usage:
//   <FileIcon entry={dirEntry} size="md" />
//   <FileIcon name="report.pdf" size="sm" />
//   <FileIcon path="/abs/path/photo.jpg" size="lg" thumbnail />

import { useMemo } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";

export type FileIconSize = "xs" | "sm" | "md" | "lg" | "xl";

interface Props {
  /** Most callers pass the full DirEntryInfo. */
  entry?: { name: string; path?: string; is_dir?: boolean; extension?: string; mime?: string };
  /** Or just supply the bits manually. */
  name?: string;
  path?: string;
  isDir?: boolean;
  extension?: string;
  mime?: string;
  size?: FileIconSize;
  /** When true, render a real thumbnail for images instead of the badge. */
  thumbnail?: boolean;
  className?: string;
}

const SIZE_PX: Record<FileIconSize, number> = {
  xs: 16,
  sm: 24,
  md: 36,
  lg: 56,
  xl: 96,
};

// Brand color pairs (top, bottom) for the gradient tile.
const PALETTE = {
  folder: ["#FBBF24", "#F59E0B"],      // amber
  folder_blue: ["#60A5FA", "#3B82F6"], // blue (system dirs)
  pdf: ["#F87171", "#DC2626"],         // red
  word: ["#60A5FA", "#2563EB"],        // blue
  excel: ["#34D399", "#059669"],       // green
  ppt: ["#FB923C", "#EA580C"],         // orange
  image: ["#F472B6", "#EC4899"],       // pink
  video: ["#A78BFA", "#7C3AED"],       // violet
  audio: ["#FB7185", "#E11D48"],       // rose
  archive: ["#FCD34D", "#D97706"],     // amber-darker
  code: ["#34D399", "#10B981"],        // emerald
  markdown: ["#9CA3AF", "#4B5563"],    // slate
  text: ["#9CA3AF", "#6B7280"],        // gray
  font: ["#A78BFA", "#6366F1"],        // indigo
  font_alt: ["#F472B6", "#A855F7"],    // pink-violet (for OTF)
  json: ["#FBBF24", "#D97706"],
  html: ["#FB923C", "#EA580C"],
  css: ["#60A5FA", "#3B82F6"],
  raw: ["#A78BFA", "#7C3AED"],         // raw photo
  psd: ["#60A5FA", "#1D4ED8"],
  exe: ["#9CA3AF", "#374151"],
  unknown: ["#D1D5DB", "#9CA3AF"],
} as const;

type Kind = keyof typeof PALETTE;

interface Resolved {
  kind: Kind;
  /** Big-ish letter shown on the tile. */
  label: string;
}

const EXT_MAP: Record<string, Resolved> = {
  pdf: { kind: "pdf", label: "PDF" },
  doc: { kind: "word", label: "DOC" },
  docx: { kind: "word", label: "DOC" },
  rtf: { kind: "word", label: "RTF" },
  xls: { kind: "excel", label: "XLS" },
  xlsx: { kind: "excel", label: "XLS" },
  csv: { kind: "excel", label: "CSV" },
  tsv: { kind: "excel", label: "TSV" },
  numbers: { kind: "excel", label: "NUM" },
  ppt: { kind: "ppt", label: "PPT" },
  pptx: { kind: "ppt", label: "PPT" },
  key: { kind: "ppt", label: "KEY" },

  jpg: { kind: "image", label: "JPG" },
  jpeg: { kind: "image", label: "JPG" },
  png: { kind: "image", label: "PNG" },
  gif: { kind: "image", label: "GIF" },
  webp: { kind: "image", label: "WEBP" },
  bmp: { kind: "image", label: "BMP" },
  tiff: { kind: "image", label: "TIFF" },
  heic: { kind: "image", label: "HEIC" },
  svg: { kind: "image", label: "SVG" },
  ico: { kind: "image", label: "ICO" },

  cr2: { kind: "raw", label: "RAW" },
  cr3: { kind: "raw", label: "RAW" },
  nef: { kind: "raw", label: "RAW" },
  arw: { kind: "raw", label: "RAW" },
  dng: { kind: "raw", label: "RAW" },
  raf: { kind: "raw", label: "RAW" },
  rw2: { kind: "raw", label: "RAW" },
  orf: { kind: "raw", label: "RAW" },

  psd: { kind: "psd", label: "PSD" },
  psb: { kind: "psd", label: "PSB" },
  ai: { kind: "psd", label: "AI" },
  sketch: { kind: "psd", label: "SK" },
  xd: { kind: "psd", label: "XD" },

  mp4: { kind: "video", label: "MP4" },
  mov: { kind: "video", label: "MOV" },
  mkv: { kind: "video", label: "MKV" },
  avi: { kind: "video", label: "AVI" },
  webm: { kind: "video", label: "WEBM" },
  m4v: { kind: "video", label: "M4V" },
  flv: { kind: "video", label: "FLV" },

  mp3: { kind: "audio", label: "MP3" },
  flac: { kind: "audio", label: "FLAC" },
  wav: { kind: "audio", label: "WAV" },
  aac: { kind: "audio", label: "AAC" },
  m4a: { kind: "audio", label: "M4A" },
  ogg: { kind: "audio", label: "OGG" },
  opus: { kind: "audio", label: "OPUS" },

  zip: { kind: "archive", label: "ZIP" },
  rar: { kind: "archive", label: "RAR" },
  "7z": { kind: "archive", label: "7Z" },
  tar: { kind: "archive", label: "TAR" },
  gz: { kind: "archive", label: "GZ" },
  bz2: { kind: "archive", label: "BZ2" },
  xz: { kind: "archive", label: "XZ" },

  ttf: { kind: "font", label: "TTF" },
  otf: { kind: "font_alt", label: "OTF" },
  woff: { kind: "font", label: "WOFF" },
  woff2: { kind: "font", label: "WOFF" },
  fnt: { kind: "font", label: "FNT" },

  md: { kind: "markdown", label: "MD" },
  markdown: { kind: "markdown", label: "MD" },
  mdx: { kind: "markdown", label: "MDX" },
  rst: { kind: "markdown", label: "RST" },
  txt: { kind: "text", label: "TXT" },
  log: { kind: "text", label: "LOG" },
  ini: { kind: "text", label: "INI" },
  conf: { kind: "text", label: "CFG" },
  yaml: { kind: "text", label: "YML" },
  yml: { kind: "text", label: "YML" },
  toml: { kind: "text", label: "TOML" },

  json: { kind: "json", label: "JSON" },
  xml: { kind: "json", label: "XML" },

  html: { kind: "html", label: "HTML" },
  htm: { kind: "html", label: "HTML" },
  css: { kind: "css", label: "CSS" },
  scss: { kind: "css", label: "SCSS" },
  less: { kind: "css", label: "LESS" },

  js: { kind: "code", label: "JS" },
  jsx: { kind: "code", label: "JSX" },
  ts: { kind: "code", label: "TS" },
  tsx: { kind: "code", label: "TSX" },
  vue: { kind: "code", label: "VUE" },
  svelte: { kind: "code", label: "SVE" },
  py: { kind: "code", label: "PY" },
  rs: { kind: "code", label: "RS" },
  go: { kind: "code", label: "GO" },
  java: { kind: "code", label: "JAVA" },
  kt: { kind: "code", label: "KT" },
  swift: { kind: "code", label: "SWFT" },
  rb: { kind: "code", label: "RB" },
  php: { kind: "code", label: "PHP" },
  c: { kind: "code", label: "C" },
  cc: { kind: "code", label: "C++" },
  cpp: { kind: "code", label: "C++" },
  cxx: { kind: "code", label: "C++" },
  h: { kind: "code", label: "H" },
  hpp: { kind: "code", label: "HPP" },
  sh: { kind: "code", label: "SH" },
  bash: { kind: "code", label: "BASH" },
  zsh: { kind: "code", label: "ZSH" },
  lua: { kind: "code", label: "LUA" },
  sql: { kind: "code", label: "SQL" },
  dart: { kind: "code", label: "DART" },

  exe: { kind: "exe", label: "EXE" },
  msi: { kind: "exe", label: "MSI" },
  app: { kind: "exe", label: "APP" },
  dmg: { kind: "exe", label: "DMG" },
  deb: { kind: "exe", label: "DEB" },
  rpm: { kind: "exe", label: "RPM" },
  apk: { kind: "exe", label: "APK" },
};

// MIME-based fallback when we have no extension info.
function fromMime(mime?: string): Resolved | null {
  if (!mime) return null;
  if (mime.startsWith("image/")) return { kind: "image", label: "IMG" };
  if (mime.startsWith("video/")) return { kind: "video", label: "VID" };
  if (mime.startsWith("audio/")) return { kind: "audio", label: "AUD" };
  if (mime.startsWith("text/")) return { kind: "text", label: "TXT" };
  return null;
}

function resolveFromName(name: string, mime?: string): Resolved {
  const dot = name.lastIndexOf(".");
  if (dot > 0) {
    const ext = name.slice(dot + 1).toLowerCase();
    const r = EXT_MAP[ext];
    if (r) return r;
  }
  const m = fromMime(mime);
  if (m) return m;
  // last-resort: use the extension itself as the label
  if (dot > 0) {
    const ext = name.slice(dot + 1, dot + 6).toUpperCase();
    return { kind: "unknown", label: ext };
  }
  return { kind: "unknown", label: "FILE" };
}

const IMG_EXTS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "svg",
  "ico",
]);

export function FileIcon({
  entry,
  name,
  path,
  isDir,
  extension,
  mime,
  size = "md",
  thumbnail,
  className,
}: Props) {
  const px = SIZE_PX[size];
  const finalName = entry?.name ?? name ?? "";
  const finalPath = entry?.path ?? path;
  const finalIsDir = entry?.is_dir ?? isDir ?? false;
  const finalExt = (entry?.extension ?? extension ?? "").toLowerCase();
  const finalMime = entry?.mime ?? mime;

  const resolved: Resolved = useMemo(() => {
    if (finalIsDir) {
      // Heuristic: system-shaped paths (capitalized macOS dirs etc.) → blue
      const blueish = /^(System|Library|Applications|Users)$/i.test(finalName);
      return { kind: blueish ? "folder_blue" : "folder", label: "" };
    }
    const candidate = finalExt
      ? EXT_MAP[finalExt]
      : resolveFromName(finalName, finalMime);
    return candidate || resolveFromName(finalName, finalMime);
  }, [finalName, finalIsDir, finalExt, finalMime]);

  // Folder → SVG shape
  if (finalIsDir) {
    return <FolderIcon px={px} kind={resolved.kind} className={className} />;
  }

  // Image with thumbnail
  if (thumbnail && finalPath && IMG_EXTS.has(finalExt)) {
    return (
      <div
        className={cn("rounded-md overflow-hidden bg-muted shrink-0", className)}
        style={{ width: px, height: px }}
      >
        <img
          src={convertFileSrc(finalPath)}
          alt=""
          draggable={false}
          loading="lazy"
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      </div>
    );
  }

  // Type-badge tile
  return (
    <BadgeIcon
      px={px}
      kind={resolved.kind}
      label={resolved.label}
      className={className}
    />
  );
}

function FolderIcon({
  px,
  kind,
  className,
}: {
  px: number;
  kind: Kind;
  className?: string;
}) {
  const [a, b] = PALETTE[kind] || PALETTE.folder;
  const id = useMemo(() => `g-${Math.random().toString(36).slice(2, 8)}`, []);
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 64 64"
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={a} />
          <stop offset="100%" stopColor={b} />
        </linearGradient>
      </defs>
      {/* tab */}
      <path
        d="M6 16 Q6 12 10 12 L24 12 Q26 12 27 13.5 L30 17 L54 17 Q58 17 58 21 L58 24 L6 24 Z"
        fill={a}
        opacity="0.85"
      />
      {/* body */}
      <rect x="6" y="22" width="52" height="32" rx="4" fill={`url(#${id})`} />
      {/* highlight */}
      <rect
        x="6"
        y="22"
        width="52"
        height="6"
        rx="4"
        fill="white"
        opacity="0.18"
      />
    </svg>
  );
}

function BadgeIcon({
  px,
  kind,
  label,
  className,
}: {
  px: number;
  kind: Kind;
  label: string;
  className?: string;
}) {
  const [a, b] = PALETTE[kind] || PALETTE.unknown;
  const id = useMemo(() => `b-${Math.random().toString(36).slice(2, 8)}`, []);
  // Sheet of paper shape with folded corner.
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 64 64"
      className={cn("shrink-0", className)}
      role="img"
      aria-label={label || "file"}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={a} />
          <stop offset="100%" stopColor={b} />
        </linearGradient>
      </defs>
      {/* paper */}
      <path
        d="M14 6 L40 6 L54 20 L54 56 Q54 60 50 60 L14 60 Q10 60 10 56 L10 10 Q10 6 14 6 Z"
        fill={`url(#${id})`}
      />
      {/* folded corner */}
      <path
        d="M40 6 L54 20 L42 20 Q40 20 40 18 Z"
        fill="white"
        opacity="0.30"
      />
      {/* label band */}
      {label && (
        <g>
          <rect
            x="6"
            y="36"
            width={Math.min(48, 12 + label.length * 8)}
            height="14"
            rx="3"
            fill="white"
            opacity="0.95"
          />
          <text
            x={6 + Math.min(48, 12 + label.length * 8) / 2}
            y="46"
            textAnchor="middle"
            fontSize="9"
            fontWeight="700"
            fill={b}
            fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            letterSpacing="0.5"
          >
            {label}
          </text>
        </g>
      )}
    </svg>
  );
}
