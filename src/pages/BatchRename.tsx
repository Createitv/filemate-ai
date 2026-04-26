import { useState } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import * as api from "@/api";
import { toast, toastError } from "@/components/ui/toast";

export default function BatchRename() {
  const [paths, setPaths] = useState<string[]>([]);
  const [tpl, setTpl] = useState("{seq:3}_{stem}");
  const [start, setStart] = useState(1);
  const [step, setStep] = useState(1);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [plans, setPlans] = useState<Array<{ from: string; to: string }>>([]);

  const pick = async () => {
    const r = await openDialog({ multiple: true });
    if (Array.isArray(r)) setPaths(r.map(String));
    else if (r) setPaths([String(r)]);
  };

  const preview = async () => {
    if (paths.length === 0) return;
    try {
      const out = await api.batchRenamePreview(paths, {
        template: tpl,
        start,
        step,
        replace: findText ? [findText, replaceText] : undefined,
      });
      setPlans(out);
    } catch (e) {
      toastError(e);
    }
  };

  const apply = async () => {
    try {
      const n = await api.batchRenameApply(plans);
      toast(`已重命名 ${n} 项`, "success");
      setPaths([]);
      setPlans([]);
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <TopBar title="批量重命名" />
      <div className="p-6 space-y-4 flex-1 overflow-y-auto">
        <div className="flex items-center gap-2">
          <Button onClick={pick} variant="outline">选择文件</Button>
          <span className="text-xs text-muted-foreground">{paths.length} 个文件已选</span>
        </div>

        <Card className="p-5 grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-medium mb-1.5">模板</div>
            <Input value={tpl} onChange={(e) => setTpl(e.target.value)} />
            <div className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
              变量：{"{seq[:N]}"} {"{stem}"} {"{ext}"} {"{date}"} {"{y}"} {"{m}"} {"{d}"} {"{upper}"} {"{lower}"}
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <div className="text-xs font-medium mb-1.5">起始</div>
              <Input type="number" value={start} onChange={(e) => setStart(Number(e.target.value))} />
            </div>
            <div className="flex-1">
              <div className="text-xs font-medium mb-1.5">步长</div>
              <Input type="number" value={step} onChange={(e) => setStep(Number(e.target.value))} />
            </div>
          </div>
          <div>
            <div className="text-xs font-medium mb-1.5">查找</div>
            <Input value={findText} onChange={(e) => setFindText(e.target.value)} />
          </div>
          <div>
            <div className="text-xs font-medium mb-1.5">替换为</div>
            <Input value={replaceText} onChange={(e) => setReplaceText(e.target.value)} />
          </div>
        </Card>

        <div className="flex items-center gap-2">
          <Button onClick={preview}>预览</Button>
          <Button onClick={apply} disabled={plans.length === 0}>
            应用 ({plans.length})
          </Button>
        </div>

        <Card>
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">原文件</th>
                <th className="px-4 py-2 font-medium">→</th>
                <th className="px-4 py-2 font-medium">新文件</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.from} className="border-b border-border/40">
                  <td className="px-4 py-2 truncate max-w-[300px]">{p.from.split(/[\\/]/).pop()}</td>
                  <td className="px-4 py-2 text-muted-foreground">→</td>
                  <td className="px-4 py-2 truncate max-w-[300px] text-primary">
                    {p.to.split(/[\\/]/).pop()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
