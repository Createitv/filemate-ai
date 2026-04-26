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
  entry?: {
    name: string;
    path?: string;
    is_dir?: boolean;
    extension?: string;
    mime?: string;
    is_empty?: boolean;
  };
  /** Or just supply the bits manually. */
  name?: string;
  path?: string;
  isDir?: boolean;
  extension?: string;
  mime?: string;
  /** Folders only: ghost the icon when the folder has zero entries. */
  isEmpty?: boolean;
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
  isEmpty,
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
  const finalIsEmpty = entry?.is_empty ?? isEmpty ?? false;

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

  // Folder → SVG shape (ghosted when empty so users can see at-a-glance)
  if (finalIsDir) {
    return (
      <FolderIcon
        px={px}
        kind={resolved.kind}
        empty={finalIsEmpty}
        className={className}
      />
    );
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

// Detect host OS once at module load. We can't use Tauri's async os plugin
// here because the icon must render synchronously inside list rows, but the
// userAgent reliably exposes the platform on every WebView we ship.
const PLATFORM: "macos" | "windows" | "linux" = (() => {
  if (typeof navigator === "undefined") return "macos";
  const ua = navigator.userAgent;
  if (/Win/i.test(ua)) return "windows";
  if (/Mac|iPhone|iPad/i.test(ua)) return "macos";
  return "linux";
})();

function FolderIcon({
  px,
  kind,
  empty,
  className,
}: {
  px: number;
  kind: Kind;
  empty?: boolean;
  className?: string;
}) {
  // System dirs (Library/Applications/Users) get the blue tint regardless of
  // platform — the body of the folder still follows the host OS shape.
  const tinted = kind === "folder_blue";
  // Empty folders: render at reduced opacity, with a small "0" badge in the
  // bottom-right corner of the icon. Wrapped in a relative container so the
  // overlay positions correctly without changing the SVG itself.
  const inner = (() => {
    if (PLATFORM === "windows") {
      return <WindowsFolder px={px} tinted={tinted} />;
    }
    return <MacFolder px={px} tinted={tinted} />;
  })();
  if (!empty) {
    return <div className={cn("shrink-0", className)}>{inner}</div>;
  }
  return (
    <div
      className={cn("relative shrink-0", className)}
      title="空文件夹"
      style={{ width: px, height: px }}
    >
      <div className="opacity-50">{inner}</div>
      {/* dashed outline overlay to read as 'empty' even at a glance */}
      <div
        className="absolute inset-[12%] rounded-[15%] border-2 border-dashed border-muted-foreground/40 pointer-events-none"
        aria-hidden
      />
    </div>
  );
}

/**
 * macOS Big Sur+ style folder: cool blue gradient with a darker back panel
 * peeking above the tab. Suggests the 3D depth of the system icon while
 * staying flat enough to scale down to 16px without artifacts.
 */
function MacFolder({
  px,
  tinted,
  className,
}: {
  px: number;
  tinted?: boolean;
  className?: string;
}) {
  const id = useMemo(() => `mf-${Math.random().toString(36).slice(2, 8)}`, []);
  // Default: macOS classic blue. Tinted variant: subtler indigo for system
  // dirs so they read as "system" rather than user-created.
  const back = tinted ? "#5E81F4" : "#5BA8E5";
  const frontA = tinted ? "#7B97F8" : "#8DC9F6";
  const frontB = tinted ? "#5773F0" : "#5BA8E5";
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 64 64"
      className={cn("shrink-0", className)}
      role="img"
      aria-label="folder"
    >
      <defs>
        <linearGradient id={`${id}-front`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={frontA} />
          <stop offset="100%" stopColor={frontB} />
        </linearGradient>
      </defs>
      {/* back panel with tab */}
      <path
        d="M6 18 Q6 14 10 14 L24 14 Q26 14 27.4 15.4 L31 19 L54 19 Q58 19 58 23 L58 51 Q58 55 54 55 L10 55 Q6 55 6 51 Z"
        fill={back}
      />
      {/* front panel rounded with subtle inner gradient */}
      <path
        d="M6 26 L58 26 L58 51 Q58 55 54 55 L10 55 Q6 55 6 51 Z"
        fill={`url(#${id}-front)`}
      />
      {/* top highlight on front panel */}
      <path
        d="M6 26 L58 26 L58 30 L6 30 Z"
        fill="white"
        opacity="0.12"
      />
      {/* subtle shadow line where tab meets body */}
      <line
        x1="6"
        y1="26"
        x2="58"
        y2="26"
        stroke="#000"
        strokeOpacity="0.08"
        strokeWidth="0.6"
      />
    </svg>
  );
}

/**
 * Windows 11 / Fluent style folder: warm yellow with a flat tab and very
 * slight gradient. Sharper corners than macOS.
 */
function WindowsFolder({
  px,
  tinted,
  className,
}: {
  px: number;
  tinted?: boolean;
  className?: string;
}) {
  const id = useMemo(() => `wf-${Math.random().toString(36).slice(2, 8)}`, []);
  const tabColor = tinted ? "#7AAEF9" : "#F2B348";
  const bodyA = tinted ? "#A6C8FB" : "#FFE4A8";
  const bodyB = tinted ? "#7AAEF9" : "#FBC75A";
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 64 64"
      className={cn("shrink-0", className)}
      role="img"
      aria-label="folder"
    >
      <defs>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={bodyA} />
          <stop offset="100%" stopColor={bodyB} />
        </linearGradient>
      </defs>
      {/* tab strip across the top */}
      <path
        d="M6 16 Q6 13 9 13 L24 13 Q25.5 13 26.5 14.2 L29 17 L58 17 Q60 17 60 19 L60 22 L6 22 Z"
        fill={tabColor}
      />
      {/* body */}
      <rect x="6" y="20" width="54" height="32" rx="2" fill={`url(#${id}-body)`} />
      {/* fluent-style top-edge highlight */}
      <rect x="6" y="20" width="54" height="3" rx="2" fill="white" opacity="0.4" />
      {/* subtle bottom shadow line */}
      <rect x="6" y="51" width="54" height="1" fill="#000" opacity="0.10" />
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
  if (PLATFORM === "windows") {
    return <WindowsFileBadge px={px} kind={kind} label={label} className={className} />;
  }
  return <MacFileBadge px={px} kind={kind} label={label} className={className} />;
}

/**
 * macOS Finder document style — soft white sheet with rounded corners and a
 * folded triangle in the upper-right. The format name sits in a small
 * colored chip near the bottom rather than tinting the whole tile, matching
 * how macOS draws Pages / PDF / Numbers icons.
 */
function MacFileBadge({
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
  const [, accent] = PALETTE[kind] || PALETTE.unknown;
  const id = useMemo(() => `m-${Math.random().toString(36).slice(2, 8)}`, []);
  const chipW = Math.min(40, 14 + label.length * 6.5);
  const chipX = 32 - chipW / 2;
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
        <linearGradient id={`${id}-paper`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#F4F4F5" />
        </linearGradient>
      </defs>
      {/* paper with folded top-right corner */}
      <path
        d="M14 6 Q12 6 12 8 L12 56 Q12 58 14 58 L50 58 Q52 58 52 56 L52 22 L38 22 Q36 22 36 20 L36 6 Z"
        fill={`url(#${id}-paper)`}
        stroke="#D4D4D8"
        strokeWidth="0.7"
      />
      {/* fold triangle */}
      <path d="M36 6 L52 22 L36 22 Z" fill="#E4E4E7" />
      <path d="M36 6 L52 22" stroke="#D4D4D8" strokeWidth="0.7" />
      {/* format chip */}
      {label && (
        <g>
          <rect x={chipX} y="42" width={chipW} height="11" rx="2.5" fill={accent} />
          <text
            x="32"
            y="50"
            textAnchor="middle"
            fontSize="7"
            fontWeight="700"
            fill="white"
            fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif"
            letterSpacing="0.3"
          >
            {label}
          </text>
        </g>
      )}
    </svg>
  );
}

/**
 * Windows Explorer document style — sharper white sheet with a tabbed
 * top-right corner and a heavier colored stripe at the bottom carrying
 * the format letters. Mirrors how Windows draws DOCX / PDF / TXT icons
 * with their distinctive corner-and-base color block.
 */
function WindowsFileBadge({
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
  const [light, accent] = PALETTE[kind] || PALETTE.unknown;
  const id = useMemo(() => `w-${Math.random().toString(36).slice(2, 8)}`, []);
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
        <linearGradient id={`${id}-paper`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#F1F5F9" />
        </linearGradient>
      </defs>
      {/* paper with sharper corner */}
      <path
        d="M12 6 L40 6 L54 20 L54 58 L12 58 Z"
        fill={`url(#${id}-paper)`}
        stroke="#CBD5E1"
        strokeWidth="0.7"
      />
      {/* corner fold */}
      <path d="M40 6 L54 20 L40 20 Z" fill={light} opacity="0.4" />
      <path d="M40 6 L40 20 L54 20" stroke="#CBD5E1" strokeWidth="0.7" fill="none" />
      {/* color stripe at bottom carrying the format letters (Windows style) */}
      {label && (
        <g>
          <rect x="12" y="40" width="42" height="14" fill={accent} />
          <text
            x="33"
            y="50"
            textAnchor="middle"
            fontSize="8"
            fontWeight="800"
            fill="white"
            fontFamily="'Segoe UI', system-ui, sans-serif"
            letterSpacing="0.5"
          >
            {label}
          </text>
        </g>
      )}
    </svg>
  );
}
