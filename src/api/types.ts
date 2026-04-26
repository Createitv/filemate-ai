// Type definitions for Tauri command return values. Keep in sync with the
// Serde-derived structs in src-tauri/src/*.

export interface DirEntryInfo {
  name: string;
  path: string;
  is_dir: boolean;
  is_symlink: boolean;
  size: number;
  modified?: string;
  created?: string;
  mime?: string;
  extension?: string;
}

export interface DirListing {
  path: string;
  parent?: string;
  entries: DirEntryInfo[];
}

export interface UserDir {
  name: string;
  path: string;
  kind: "home" | "desktop" | "download" | "document" | "picture" | "video" | "audio";
}

export interface DiskInfo {
  name: string;
  mount_point: string;
  total: number;
  available: number;
  used: number;
  percent: number;
  fs: string;
  removable: boolean;
}

export interface RecentEntry {
  path: string;
  name: string;
  accessed_at: number;
  is_dir: boolean;
}

export interface Bookmark {
  id: number;
  path: string;
  name: string;
  group_name?: string;
  sort_order: number;
  created_at: number;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
  created_at: number;
}

export interface Workspace {
  id: number;
  name: string;
  state: any;
  created_at: number;
  updated_at: number;
}

export interface SearchHit {
  path: string;
  name: string;
  ext?: string;
  size: number;
  modified: number;
  score: number;
}

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: any;
  conditions: any[];
  actions: any[];
}

export interface RuleRecord extends Rule {
  created_at: number;
  updated_at: number;
}

export interface VersionInfo {
  id: string;
  file_path: string;
  version_id: number;
  timestamp: number;
  size: number;
  checksum: string;
  note?: string;
  source: string;
  storage: string;
}

export interface CloudFile {
  id: string;
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified?: number;
}

export interface CloudAccount {
  id: string;
  provider: "s3" | "onedrive" | "gdrive" | "dropbox" | "webdav";
  name: string;
  config: any;
  created_at: number;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

// ---------- preview ----------

export type PreviewKind =
  | "image"
  | "raw"
  | "psd"
  | "svg"
  | "video"
  | "audio"
  | "font"
  | "archive"
  | "model3d"
  | "markdown"
  | "pdf"
  | "office"
  | "code"
  | "text"
  | "binary";

export interface ExifEntry {
  tag: string;
  group: string;
  value: string;
}

export interface Histogram {
  r: number[];
  g: number[];
  b: number[];
  luminance: number[];
}

export interface ImageMeta {
  width: number;
  height: number;
  color: string;
  exif: ExifEntry[];
  histogram: Histogram;
}

export interface AudioMeta {
  title?: string;
  artist?: string;
  album?: string;
  album_artist?: string;
  year?: number;
  track?: number;
  genre?: string;
  duration_ms: number;
  bitrate?: number;
  sample_rate?: number;
  channels?: number;
  format: string;
}

export interface FontMeta {
  family?: string;
  subfamily?: string;
  full_name?: string;
  version?: string;
  copyright?: string;
  manufacturer?: string;
  designer?: string;
  format: string;
  num_glyphs?: number;
}

export type FormatExtras =
  | { kind: "none" }
  | ({ kind: "image" } & ImageMeta)
  | ({ kind: "audio" } & AudioMeta)
  | ({ kind: "font" } & FontMeta);

export interface PreviewMeta {
  kind: PreviewKind;
  mime?: string;
  size: number;
  modified?: number;
  created?: number;
  extension?: string;
  text?: string;
  language?: string;
  extras: FormatExtras;
}

// ---------- ai ----------

export type AIProviderKind = "openai" | "anthropic" | "ollama";

export interface AIProvider {
  id: string;
  name: string;
  kind: AIProviderKind;
  base_url: string;
  api_key: string;
  model: string;
  temperature: number;
  max_tokens: number;
  top_p: number;
  extra: any;
  is_active: boolean;
  created_at: number;
  updated_at: number;
}

export interface FileBrief {
  path: string;
  name: string;
  size: number;
  modified: number;
}

export interface FolderStats {
  root: string;
  total_files: number;
  total_dirs: number;
  total_bytes: number;
  by_extension: Array<[string, number, number]>;
  biggest: FileBrief[];
  oldest: FileBrief[];
  recently_modified: FileBrief[];
  naming_anomalies: string[];
  potential_dupes: number;
}

export interface AnalyzeResult {
  stats: FolderStats;
  advice: string;
  session_id: string;
}

export interface AppInfo {
  id: string;
  name: string;
  path: string;
  kind: "macos_app" | "linux_desktop" | "windows_exec";
}

export interface IndexedEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified: number;
}

export interface FilenameIndexStatus {
  root: string | null;
  count: number;
  indexing: boolean;
  progress: number;
  built_at: number;
}

export type FsEvent =
  | { kind: "created"; path: string }
  | { kind: "modified"; path: string }
  | { kind: "removed"; path: string }
  | { kind: "renamed"; from: string; to: string }
  | { kind: "other"; path: string };
