import { create } from "zustand";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "success" | "error" | "info";

interface Toast {
  id: number;
  msg: string;
  variant: Variant;
}

interface State {
  toasts: Toast[];
  push: (msg: string, variant?: Variant) => void;
  dismiss: (id: number) => void;
}

export const useToasts = create<State>((set) => ({
  toasts: [],
  push: (msg, variant = "info") => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts, { id, msg, variant }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function toast(msg: string, variant: Variant = "info") {
  useToasts.getState().push(msg, variant);
}

export function toastError(err: unknown) {
  toast(String(err instanceof Error ? err.message : err), "error");
}

export function ToastViewport() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="fixed bottom-4 right-4 z-[1000] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => {
        const Icon =
          t.variant === "success" ? CheckCircle2 : t.variant === "error" ? XCircle : Info;
        return (
          <div
            key={t.id}
            className={cn(
              "flex items-start gap-2 rounded-xl px-3 py-2.5 shadow-lg border text-sm bg-card",
              t.variant === "error" && "border-rose-500/40 text-rose-700 dark:text-rose-300",
              t.variant === "success" && "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
            )}
          >
            <Icon className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="flex-1 break-words">{t.msg}</div>
            <button onClick={() => dismiss(t.id)} className="text-muted-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
