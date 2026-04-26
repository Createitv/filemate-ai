export function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  const k = 1024;
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`;
}

export function formatTime(timestamp?: number | string): string {
  if (!timestamp) return "—";
  const d = typeof timestamp === "number" ? new Date(timestamp * 1000) : new Date(timestamp);
  if (isNaN(d.getTime())) return "—";
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return sameYear
    ? d.toLocaleString(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString(undefined, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function relativeTime(timestamp?: number | string): string {
  if (!timestamp) return "—";
  const d = typeof timestamp === "number" ? timestamp * 1000 : new Date(timestamp).getTime();
  const diff = Date.now() - d;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 86_400_000 * 7) return `${Math.floor(diff / 86_400_000)} 天前`;
  return formatTime(typeof timestamp === "number" ? timestamp : timestamp);
}

export function fileIconColor(ext?: string): string {
  if (!ext) return "text-muted-foreground";
  const e = ext.toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp", "heic", "tiff", "svg"].includes(e)) return "text-rose-500";
  if (["mp4", "mov", "mkv", "avi", "webm"].includes(e)) return "text-violet-500";
  if (["mp3", "flac", "wav", "aac", "m4a"].includes(e)) return "text-amber-500";
  if (["pdf"].includes(e)) return "text-red-500";
  if (["doc", "docx"].includes(e)) return "text-blue-500";
  if (["xls", "xlsx", "csv"].includes(e)) return "text-green-500";
  if (["ppt", "pptx"].includes(e)) return "text-orange-500";
  if (["zip", "rar", "7z", "tar", "gz"].includes(e)) return "text-yellow-600";
  if (["rs", "ts", "tsx", "js", "jsx", "py", "go", "java", "cpp", "c", "h"].includes(e)) return "text-emerald-500";
  if (["md", "txt"].includes(e)) return "text-slate-500";
  return "text-muted-foreground";
}
