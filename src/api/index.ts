// Typed wrappers around `@tauri-apps/api/core::invoke`. Each backend command
// gets its own thin function so the rest of the app calls api.listDir(...)
// instead of stringly-typed invoke names.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  DirListing,
  DiskInfo,
  RecentEntry,
  Bookmark,
  Tag,
  Workspace,
  SearchHit,
  RuleRecord,
  Rule,
  VersionInfo,
  CloudFile,
  CloudAccount,
  ChatMessage,
  PreviewMeta,
  FsEvent,
  DirEntryInfo,
  AIProvider,
  FolderStats,
  AnalyzeResult,
} from "./types";

// ---------- fs ----------
export const listDir = (path: string, showHidden = false) =>
  invoke<DirListing>("list_dir", { path, showHidden });
export const homeDir = () => invoke<string>("home_dir");
export const createFolder = (path: string, name: string) =>
  invoke<string>("create_folder", { path, name });
export const renameEntry = (from: string, to: string) =>
  invoke<void>("rename_entry", { from, to });
export const deleteToTrash = (paths: string[]) =>
  invoke<void>("delete_to_trash", { paths });
export const copyEntry = (from: string, to: string, overwrite = false) =>
  invoke<void>("copy_entry", { from, to, overwrite });
export const moveEntry = (from: string, to: string) =>
  invoke<void>("move_entry", { from, to });
export const metadata = (path: string) =>
  invoke<DirEntryInfo>("metadata", { path });
export const openPath = (path: string) => invoke<void>("open_path", { path });

// ---------- open with ----------
export const listInstalledApps = () =>
  invoke<import("./types").AppInfo[]>("list_installed_apps");
export const openWith = (path: string, appId: string) =>
  invoke<void>("open_with", { path, appId });
export const openWithDialog = (path: string) =>
  invoke<void>("open_with_dialog", { path });
export const revealInFolder = (path: string) =>
  invoke<void>("reveal_in_folder", { path });

// ---------- disk ----------
export const listDisks = () => invoke<DiskInfo[]>("list_disks");

// ---------- settings ----------
export const getSetting = <T = any>(key: string) =>
  invoke<T | null>("get_setting", { key });
export const setSetting = (key: string, value: any) =>
  invoke<void>("set_setting", { key, value });

// ---------- recents ----------
export const touchRecent = (path: string, name: string, isDir: boolean) =>
  invoke<void>("touch_recent", { path, name, isDir });
export const listRecents = (limit?: number) =>
  invoke<RecentEntry[]>("list_recents", { limit });
export const clearRecents = () => invoke<void>("clear_recents");

// ---------- bookmarks ----------
export const addBookmark = (path: string, name: string, group?: string) =>
  invoke<number>("add_bookmark", { path, name, group });
export const removeBookmark = (id: number) =>
  invoke<void>("remove_bookmark", { id });
export const listBookmarks = () => invoke<Bookmark[]>("list_bookmarks");
export const reorderBookmark = (id: number, sortOrder: number) =>
  invoke<void>("reorder_bookmark", { id, sortOrder });

// ---------- tags ----------
export const createTag = (name: string, color: string) =>
  invoke<number>("create_tag", { name, color });
export const listTags = () => invoke<Tag[]>("list_tags");
export const deleteTag = (id: number) => invoke<void>("delete_tag", { id });
export const assignTag = (path: string, tagId: number) =>
  invoke<void>("assign_tag", { path, tagId });
export const unassignTag = (path: string, tagId: number) =>
  invoke<void>("unassign_tag", { path, tagId });
export const tagsOf = (path: string) => invoke<Tag[]>("tags_of", { path });
export const pathsWithTag = (tagId: number) =>
  invoke<string[]>("paths_with_tag", { tagId });

// ---------- workspaces ----------
export const saveWorkspace = (name: string, payload: any) =>
  invoke<number>("save_workspace", { name, payload });
export const listWorkspaces = () => invoke<Workspace[]>("list_workspaces");
export const updateWorkspace = (id: number, name?: string, payload?: any) =>
  invoke<void>("update_workspace", { id, name, payload });
export const deleteWorkspace = (id: number) =>
  invoke<void>("delete_workspace", { id });

// ---------- search ----------
export const indexDirectory = (path: string, maxFiles?: number) =>
  invoke<number>("index_directory", { path, maxFiles });
export const removePathFromIndex = (path: string) =>
  invoke<void>("remove_path_from_index", { path });
export const searchIndex = (query: string, limit = 100) =>
  invoke<SearchHit[]>("search_index", { query, limit });
export const searchFilenames = (path: string, pattern: string, limit = 500) =>
  invoke<DirEntryInfo[]>("search_filenames", { path, pattern, limit });

// ---------- watcher ----------
export const watchDir = (path: string) => invoke<void>("watch_dir", { path });
export const unwatch = () => invoke<void>("unwatch");
export const onFsEvent = (cb: (e: FsEvent) => void): Promise<UnlistenFn> =>
  listen<FsEvent>("fs:event", (e) => cb(e.payload));

// ---------- automation ----------
export const saveRule = (rule: Rule) => invoke<void>("save_rule", { rule });
export const listRules = () => invoke<RuleRecord[]>("list_rules");
export const deleteRule = (id: string) => invoke<void>("delete_rule", { id });
export const runRule = (id: string) => invoke<number>("run_rule", { id });
export const listAutomationHistory = (limit = 50) =>
  invoke<any[]>("list_automation_history", { limit });

// ---------- version ----------
export const createVersion = (path: string, note?: string) =>
  invoke<VersionInfo>("create_version", { path, note });
export const listVersions = (path: string) =>
  invoke<VersionInfo[]>("list_versions", { path });
export const restoreVersion = (path: string, versionId: number) =>
  invoke<void>("restore_version", { path, versionId });
export const diffVersions = (path: string, fromV: number, toV: number) =>
  invoke<string>("diff_versions", { path, fromVersion: fromV, toVersion: toV });
export const deleteVersion = (path: string, versionId: number) =>
  invoke<void>("delete_version", { path, versionId });

// ---------- ai ----------
export const aiChat = (messages: ChatMessage[], providerId?: string) =>
  invoke<ChatMessage>("ai_chat", { messages, providerId });
export const aiChatStream = (
  sessionId: string,
  messages: ChatMessage[],
  providerId?: string
) => invoke<void>("ai_chat_stream", { sessionId, messages, providerId });
export const aiEmbed = (text: string, providerId?: string) =>
  invoke<number[]>("ai_embed", { text, providerId });
export const aiParseIntent = (query: string) =>
  invoke<any>("ai_parse_intent", { query });
export const aiHealth = () => invoke<any>("ai_health");
export const onAiChunk = (cb: (payload: { session_id: string; delta: string }) => void) =>
  listen<{ session_id: string; delta: string }>("ai:chat_chunk", (e) => cb(e.payload));
export const onAiDone = (cb: (payload: { session_id: string; content: string }) => void) =>
  listen<{ session_id: string; content: string }>("ai:chat_done", (e) => cb(e.payload));

// ---------- ai providers ----------
export const aiProviderSave = (payload: Partial<AIProvider> & { name: string; kind: string; base_url: string; model: string }) =>
  invoke<string>("ai_provider_save", { payload });
export const aiProviderList = () => invoke<AIProvider[]>("ai_provider_list");
export const aiProviderDelete = (id: string) =>
  invoke<void>("ai_provider_delete", { id });
export const aiProviderSetActive = (id: string) =>
  invoke<void>("ai_provider_set_active", { id });
export const aiProviderTest = (payload: any) =>
  invoke<any>("ai_provider_test", { payload });

// ---------- folder analysis ----------
export const analyzeFolderSummary = (path: string) =>
  invoke<FolderStats>("analyze_folder_summary", { path });
export const analyzeFolder = (path: string, providerId?: string) =>
  invoke<AnalyzeResult>("analyze_folder", { path, providerId });
export const analyzeFolderStream = (sessionId: string, path: string, providerId?: string) =>
  invoke<FolderStats>("analyze_folder_stream", { sessionId, path, providerId });

// ---------- cloud ----------
export const addCloudAccount = (provider: string, name: string, config: any) =>
  invoke<string>("add_cloud_account", { provider, name, config });
export const listCloudAccounts = () =>
  invoke<CloudAccount[]>("list_cloud_accounts");
export const deleteCloudAccount = (id: string) =>
  invoke<void>("delete_cloud_account", { id });
export const cloudList = (accountId: string, path: string) =>
  invoke<CloudFile[]>("cloud_list", { accountId, path });
export const cloudDownload = (
  accountId: string,
  remotePath: string,
  localPath: string
) => invoke<void>("cloud_download", { accountId, remotePath, localPath });
export const cloudUpload = (
  accountId: string,
  localPath: string,
  remotePath: string
) => invoke<void>("cloud_upload", { accountId, localPath, remotePath });
export const cloudDelete = (accountId: string, path: string) =>
  invoke<void>("cloud_delete", { accountId, path });
export const cloudPresigned = (accountId: string, path: string, expires = 600) =>
  invoke<string>("cloud_presigned", { accountId, path, expiresSecs: expires });

// ---------- oauth ----------
export const oauthStart = (flow: any) => invoke<any>("oauth_start", { flow });

// ---------- encryption ----------
export const encryptFile = (input: string, output: string, password: string) =>
  invoke<void>("encrypt_file", { input, output, password });
export const decryptFile = (input: string, output: string, password: string) =>
  invoke<void>("decrypt_file", { input, output, password });
export const encryptText = (text: string, password: string) =>
  invoke<string>("encrypt_text", { text, password });
export const decryptText = (blobB64: string, password: string) =>
  invoke<string>("decrypt_text", { blobB64, password });

// ---------- archive ----------
export const listZip = (path: string) => invoke<any[]>("list_zip", { path });
export const extractZip = (zipPath: string, dest: string) =>
  invoke<number>("extract_zip", { zipPath, dest });
export const createZip = (sources: string[], dest: string) =>
  invoke<void>("create_zip", { sources, dest });

// ---------- batch ----------
export const batchRenamePreview = (paths: string[], rule: any) =>
  invoke<any[]>("batch_rename_preview", { paths, rule });
export const batchRenameApply = (plans: any[]) =>
  invoke<number>("batch_rename_apply", { plans });
export const findDuplicates = (root: string, minSize = 4096) =>
  invoke<any[]>("find_duplicates", { root, minSize });
export const sha256File = (path: string) => invoke<string>("sha256_file", { path });

// ---------- terminal ----------
export const terminalOpen = (cwd?: string, cols?: number, rows?: number) =>
  invoke<string>("terminal_open", { cwd, cols, rows });
export const terminalWrite = (id: string, data: string) =>
  invoke<void>("terminal_write", { id, data });
export const terminalResize = (id: string, cols: number, rows: number) =>
  invoke<void>("terminal_resize", { id, cols, rows });
export const terminalClose = (id: string) =>
  invoke<void>("terminal_close", { id });
export const onTerminalData = (cb: (msg: { id: string; data: string }) => void) =>
  listen<{ id: string; data: string }>("terminal:data", (e) => cb(e.payload));

// ---------- preview ----------
export const previewFile = (path: string) =>
  invoke<PreviewMeta>("preview_file", { path });
export const readTextFile = (path: string, maxBytes?: number) =>
  invoke<string>("read_text_file", { path, maxBytes });

// ---------- app ----------
export const appVersion = () => invoke<string>("app_version");
