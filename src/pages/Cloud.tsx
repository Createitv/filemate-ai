import { useEffect, useMemo, useState } from "react";
import { Cloud as CloudIcon, Plus, Trash2, Upload, Download, Folder, FileText } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import * as api from "@/api";
import type { CloudAccount, CloudFile } from "@/api/types";
import { toast, toastError } from "@/components/ui/toast";
import { formatBytes, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const PROVIDERS = [
  { id: "s3", name: "Amazon S3 / S3 兼容" },
  { id: "onedrive", name: "OneDrive" },
  { id: "gdrive", name: "Google Drive" },
  { id: "dropbox", name: "Dropbox" },
  { id: "webdav", name: "WebDAV / Nextcloud" },
];

export default function Cloud() {
  const [accounts, setAccounts] = useState<CloudAccount[]>([]);
  const [active, setActive] = useState<CloudAccount | null>(null);
  const [path, setPath] = useState("");
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [showAdd, setShowAdd] = useState<string | null>(null);

  const load = () => api.listCloudAccounts().then(setAccounts).catch(toastError);
  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (active) {
      api.cloudList(active.id, path).then(setFiles).catch(toastError);
    }
  }, [active, path]);

  const remove = async (id: string) => {
    await api.deleteCloudAccount(id);
    if (active?.id === id) setActive(null);
    load();
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <TopBar title="云存储" />
      <div className="grid grid-cols-[260px_1fr] gap-0 flex-1 overflow-hidden">
        <aside className="border-r border-border/60 overflow-y-auto p-3 space-y-1">
          <div className="px-2 py-1 text-xs uppercase tracking-wider text-muted-foreground">已连接账号</div>
          {accounts.map((a) => (
            <button
              key={a.id}
              onClick={() => {
                setActive(a);
                setPath(a.provider === "s3" ? "" : "/");
              }}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm",
                active?.id === a.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/40"
              )}
            >
              <CloudIcon className="w-4 h-4" />
              <span className="flex-1 truncate text-left">{a.name}</span>
              <span className="text-[10px] text-muted-foreground">{a.provider}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  remove(a.id);
                }}
                className="text-muted-foreground hover:text-rose-500"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </button>
          ))}
          <div className="border-t border-border/60 pt-2 mt-2">
            <div className="px-2 py-1 text-xs uppercase tracking-wider text-muted-foreground">添加账号</div>
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => setShowAdd(p.id)}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm hover:bg-accent/40"
              >
                <div className="w-5 h-5 rounded bg-gradient-to-br from-primary to-primary/60" />
                <span className="flex-1 text-left">{p.name}</span>
                <Plus className="w-3 h-3 text-muted-foreground" />
              </button>
            ))}
          </div>
        </aside>

        <div className="flex flex-col overflow-hidden">
          {active ? (
            <CloudBrowser
              account={active}
              path={path}
              setPath={setPath}
              files={files}
              refresh={() => api.cloudList(active.id, path).then(setFiles).catch(toastError)}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              选择左侧账号开始浏览
            </div>
          )}
        </div>
      </div>
      {showAdd && (
        <AddAccount
          provider={showAdd}
          onClose={() => setShowAdd(null)}
          onCreated={() => {
            load();
            setShowAdd(null);
          }}
        />
      )}
    </div>
  );
}

function CloudBrowser({
  account,
  path,
  setPath,
  files,
  refresh,
}: {
  account: CloudAccount;
  path: string;
  setPath: (p: string) => void;
  files: CloudFile[];
  refresh: () => void;
}) {
  const sorted = useMemo(
    () => [...files].sort((a, b) => Number(b.is_dir) - Number(a.is_dir) || a.name.localeCompare(b.name)),
    [files]
  );
  const upload = async () => {
    const local = await openDialog({ multiple: false });
    if (!local) return;
    const name = String(local).split(/[\\/]/).pop()!;
    const remote = path.endsWith("/") ? `${path}${name}` : `${path}/${name}`;
    try {
      await api.cloudUpload(account.id, String(local), remote);
      toast("上传完成", "success");
      refresh();
    } catch (e) {
      toastError(e);
    }
  };
  const download = async (f: CloudFile) => {
    const local = await saveDialog({ defaultPath: f.name });
    if (!local) return;
    try {
      await api.cloudDownload(account.id, f.path, String(local));
      toast("下载完成", "success");
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
        <Input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          className="flex-1"
          placeholder="路径"
        />
        <Button onClick={upload}>
          <Upload className="w-4 h-4" /> 上传
        </Button>
        <Button variant="outline" onClick={refresh}>
          刷新
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground sticky top-0 bg-background/95">
            <tr>
              <th className="px-4 py-2 font-medium">名称</th>
              <th className="px-4 py-2 font-medium w-24">大小</th>
              <th className="px-4 py-2 font-medium w-44">修改时间</th>
              <th className="px-4 py-2 font-medium w-28">操作</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((f) => (
              <tr
                key={f.id}
                onDoubleClick={() => f.is_dir && setPath(f.path)}
                className="border-b border-border/40 hover:bg-accent/40 cursor-pointer"
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    {f.is_dir ? (
                      <Folder className="w-4 h-4 text-blue-500" />
                    ) : (
                      <FileText className="w-4 h-4 text-muted-foreground" />
                    )}
                    {f.name}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{f.is_dir ? "—" : formatBytes(f.size)}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{formatTime(f.modified)}</td>
                <td className="px-4 py-2.5">
                  {!f.is_dir && (
                    <button
                      onClick={() => download(f)}
                      className="text-primary hover:underline text-xs flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" /> 下载
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div className="text-center py-12 text-sm text-muted-foreground">空目录</div>
        )}
      </div>
    </>
  );
}

function AddAccount({
  provider,
  onClose,
  onCreated,
}: {
  provider: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [config, setConfig] = useState<any>(defaultConfig(provider));
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.addCloudAccount(provider, name, config);
      onCreated();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const oauth = async (cfg: any) => {
    setBusy(true);
    try {
      const tokens = await api.oauthStart(cfg);
      setConfig({ ...config, ...tokens });
      toast("授权成功", "success");
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <Card className="max-w-lg w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="font-semibold text-lg">添加 {provider} 账号</div>
        <Input placeholder="账号显示名" value={name} onChange={(e) => setName(e.target.value)} />
        {provider === "s3" && (
          <S3Form config={config} setConfig={setConfig} />
        )}
        {provider === "webdav" && (
          <WebDavForm config={config} setConfig={setConfig} />
        )}
        {provider === "onedrive" && (
          <OAuthForm
            label="OneDrive"
            hint="需在 Azure 注册 public client，重定向 URI 设为 http://127.0.0.1/callback"
            config={config}
            setConfig={setConfig}
            onAuthorize={() =>
              oauth({
                provider: "onedrive",
                client_id: config.client_id,
                authorize_url:
                  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
                token_url: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
                redirect_uri: "http://127.0.0.1/callback",
                scope: "Files.ReadWrite.All offline_access User.Read",
              })
            }
          />
        )}
        {provider === "gdrive" && (
          <OAuthForm
            label="Google Drive"
            hint="在 GCP 控制台创建 OAuth 凭据（Desktop application）。"
            config={config}
            setConfig={setConfig}
            onAuthorize={() =>
              oauth({
                provider: "gdrive",
                client_id: config.client_id,
                client_secret: config.client_secret,
                authorize_url: "https://accounts.google.com/o/oauth2/v2/auth",
                token_url: "https://oauth2.googleapis.com/token",
                redirect_uri: "http://127.0.0.1/callback",
                scope: "https://www.googleapis.com/auth/drive",
                extra: { access_type: "offline", prompt: "consent" },
              })
            }
          />
        )}
        {provider === "dropbox" && (
          <OAuthForm
            label="Dropbox"
            hint="在 Dropbox App Console 创建 app；redirect URI 加 http://127.0.0.1/callback"
            config={config}
            setConfig={setConfig}
            onAuthorize={() =>
              oauth({
                provider: "dropbox",
                client_id: config.app_key,
                client_secret: config.app_secret,
                authorize_url: "https://www.dropbox.com/oauth2/authorize",
                token_url: "https://api.dropbox.com/oauth2/token",
                redirect_uri: "http://127.0.0.1/callback",
                scope: "files.content.read files.content.write",
                extra: { token_access_type: "offline" },
              })
            }
          />
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={submit} disabled={busy}>
            保存
          </Button>
        </div>
      </Card>
    </div>
  );
}

function defaultConfig(provider: string): any {
  if (provider === "s3")
    return {
      endpoint: "https://s3.us-east-1.amazonaws.com",
      region: "us-east-1",
      bucket: "",
      access_key: "",
      secret_key: "",
      path_style: false,
    };
  if (provider === "webdav") return { endpoint: "", username: "", password: "" };
  if (provider === "onedrive") return { client_id: "", access_token: "" };
  if (provider === "gdrive") return { client_id: "", client_secret: "", access_token: "" };
  if (provider === "dropbox") return { app_key: "", app_secret: "", access_token: "" };
  return {};
}

function S3Form({ config, setConfig }: { config: any; setConfig: (c: any) => void }) {
  return (
    <>
      {(["endpoint", "region", "bucket", "access_key", "secret_key"] as const).map((k) => (
        <Input
          key={k}
          placeholder={k}
          value={config[k] || ""}
          onChange={(e) => setConfig({ ...config, [k]: e.target.value })}
        />
      ))}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!!config.path_style}
          onChange={(e) => setConfig({ ...config, path_style: e.target.checked })}
        />
        Path-style URL（MinIO 等需要）
      </label>
    </>
  );
}

function WebDavForm({ config, setConfig }: { config: any; setConfig: (c: any) => void }) {
  return (
    <>
      {(["endpoint", "username", "password"] as const).map((k) => (
        <Input
          key={k}
          placeholder={k}
          type={k === "password" ? "password" : "text"}
          value={config[k] || ""}
          onChange={(e) => setConfig({ ...config, [k]: e.target.value })}
        />
      ))}
    </>
  );
}

function OAuthForm({
  label,
  hint,
  config,
  setConfig,
  onAuthorize,
}: {
  label: string;
  hint: string;
  config: any;
  setConfig: (c: any) => void;
  onAuthorize: () => void;
}) {
  return (
    <>
      <div className="text-xs text-muted-foreground">{hint}</div>
      {Object.keys(config)
        .filter((k) => !["access_token", "refresh_token", "expires_at"].includes(k))
        .map((k) => (
          <Input
            key={k}
            placeholder={k}
            value={config[k] || ""}
            onChange={(e) => setConfig({ ...config, [k]: e.target.value })}
          />
        ))}
      <Button variant="outline" onClick={onAuthorize}>
        在浏览器中授权 {label}
      </Button>
      {config.access_token && (
        <div className="text-xs text-emerald-600">
          已获取 access_token（{String(config.access_token).slice(0, 16)}…）
        </div>
      )}
    </>
  );
}
