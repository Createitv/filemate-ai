import { useState } from "react";
import { Lock, Unlock, KeyRound } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import * as api from "@/api";
import { toast, toastError } from "@/components/ui/toast";

export default function Encryption() {
  const [mode, setMode] = useState<"encrypt" | "decrypt">("encrypt");
  const [src, setSrc] = useState("");
  const [dst, setDst] = useState("");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);

  const pickSource = async () => {
    const p = await openDialog({ multiple: false });
    if (p) setSrc(String(p));
  };
  const pickDest = async () => {
    const p = await saveDialog({
      defaultPath: src ? `${src}${mode === "encrypt" ? ".nxenc" : ".dec"}` : undefined,
    });
    if (p) setDst(String(p));
  };

  const run = async () => {
    if (!src || !dst || !pwd) {
      toast("请填写完整", "error");
      return;
    }
    setBusy(true);
    try {
      if (mode === "encrypt") await api.encryptFile(src, dst, pwd);
      else await api.decryptFile(src, dst, pwd);
      toast(mode === "encrypt" ? "已加密" : "已解密", "success");
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <TopBar title="加密 / 解密" />
      <div className="p-6 max-w-2xl space-y-4">
        <div className="flex items-center gap-2">
          <Button variant={mode === "encrypt" ? "default" : "outline"} onClick={() => setMode("encrypt")}>
            <Lock className="w-4 h-4" /> 加密
          </Button>
          <Button variant={mode === "decrypt" ? "default" : "outline"} onClick={() => setMode("decrypt")}>
            <Unlock className="w-4 h-4" /> 解密
          </Button>
        </div>

        <Card className="p-5 space-y-3">
          <div className="text-xs text-muted-foreground">
            使用 AES-256-GCM + Argon2id KDF。密钥不落盘、不上传，只在解密时由密码现场派生。
          </div>
          <div className="flex items-center gap-2">
            <Input placeholder="源文件" value={src} readOnly className="flex-1" />
            <Button variant="outline" onClick={pickSource}>
              选择
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Input placeholder="输出文件" value={dst} readOnly className="flex-1" />
            <Button variant="outline" onClick={pickDest}>
              选择
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-muted-foreground" />
            <Input
              type="password"
              placeholder="密码"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              className="flex-1"
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={run} disabled={busy}>
              {mode === "encrypt" ? "加密" : "解密"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
