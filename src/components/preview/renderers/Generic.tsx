import { File, FileWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as api from "@/api";
import { toastError } from "@/components/ui/toast";

export function GenericRenderer({ path, hint }: { path: string; hint?: string }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-950 text-foreground p-8">
      <div className="w-20 h-20 rounded-2xl bg-card border border-border/60 flex items-center justify-center">
        <File className="w-10 h-10 text-muted-foreground" />
      </div>
      <div className="text-center max-w-md">
        <div className="font-medium">{path.split(/[\\/]/).pop()}</div>
        <div className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1">
          <FileWarning className="w-3.5 h-3.5" />
          {hint || "这种文件类型 FileMate 暂不支持内嵌预览"}
        </div>
      </div>
      <Button variant="outline" onClick={() => api.openPath(path).catch(toastError)}>
        用默认程序打开
      </Button>
    </div>
  );
}
