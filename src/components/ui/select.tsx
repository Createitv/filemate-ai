// Polished select / combobox replacing native <select>. Designed to match
// the rest of the app (rounded, themed, primary-accented). API:
//
//   <Select
//     value={x}
//     onChange={setX}
//     options={[
//       { value: "a", label: "Option A", description?: "...", icon?: <Icon/>,
//         badge?: "默认" },
//     ]}
//     placeholder="选择…"
//     searchable           // adds a filter input above the list
//     align="start" | "end"
//     className="..."
//   />

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronDown, Search, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  badge?: string;
  disabled?: boolean;
}

interface SelectProps {
  value: string | undefined;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  className?: string;
  align?: "start" | "end";
  emptyText?: string;
  size?: "sm" | "md";
}

export function Select({
  value,
  onChange,
  options,
  placeholder = "请选择",
  searchable,
  disabled,
  className,
  align = "start",
  emptyText = "无匹配项",
  size = "md",
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    if (!searchable || !filter.trim()) return options;
    const f = filter.toLowerCase();
    return options.filter(
      (o) => o.label.toLowerCase().includes(f) || o.description?.toLowerCase().includes(f)
    );
  }, [options, filter, searchable]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  useLayoutEffect(() => {
    if (open) {
      setHighlight(Math.max(0, filtered.findIndex((o) => o.value === value)));
      if (searchable) inputRef.current?.focus();
    } else {
      setFilter("");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // keep highlighted item in view
  useEffect(() => {
    if (!open) return;
    const li = listRef.current?.querySelectorAll("[data-opt]")[highlight] as HTMLElement | undefined;
    li?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlight((h) => Math.min(filtered.length - 1, h + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlight((h) => Math.max(0, h - 1));
        break;
      case "Enter":
        e.preventDefault();
        const opt = filtered[highlight];
        if (opt && !opt.disabled) {
          onChange(opt.value);
          setOpen(false);
        }
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
      case "Home":
        e.preventDefault();
        setHighlight(0);
        break;
      case "End":
        e.preventDefault();
        setHighlight(filtered.length - 1);
        break;
    }
  };

  return (
    <div ref={wrapRef} className={cn("relative inline-block", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        className={cn(
          "w-full flex items-center gap-2 rounded-lg border border-input bg-background text-left",
          size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-sm",
          "hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        )}
      >
        {selected?.icon && <span className="shrink-0">{selected.icon}</span>}
        <span
          className={cn(
            "flex-1 truncate",
            selected ? "" : "text-muted-foreground"
          )}
        >
          {selected ? selected.label : placeholder}
        </span>
        {selected?.badge && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
            {selected.badge}
          </span>
        )}
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div
          id={id}
          role="listbox"
          className={cn(
            "absolute z-50 mt-1.5 min-w-full max-w-[min(28rem,90vw)] rounded-xl bg-card border border-border shadow-xl overflow-hidden animate-in fade-in-0 zoom-in-95",
            align === "end" ? "right-0" : "left-0"
          )}
          style={{ minWidth: "max(100%, 14rem)" }}
        >
          {searchable && (
            <div className="px-3 py-2 border-b border-border/40 flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setHighlight(0);
                }}
                onKeyDown={onKey}
                placeholder="搜索…"
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>
          )}
          <div
            ref={listRef}
            className="max-h-72 overflow-y-auto scrollbar-thin py-1"
            onKeyDown={onKey}
          >
            {filtered.length === 0 && (
              <div className="px-3 py-6 text-xs text-muted-foreground text-center">
                {emptyText}
              </div>
            )}
            {filtered.map((o, i) => {
              const active = o.value === value;
              const hi = i === highlight;
              return (
                <button
                  key={o.value}
                  data-opt
                  role="option"
                  aria-selected={active}
                  type="button"
                  disabled={o.disabled}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => {
                    if (o.disabled) return;
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-md mx-1 my-0.5 text-left",
                    hi && !o.disabled && "bg-accent",
                    active && "bg-primary/10 text-primary font-medium",
                    o.disabled && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {o.icon && <span className="shrink-0">{o.icon}</span>}
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{o.label}</div>
                    {o.description && (
                      <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {o.description}
                      </div>
                    )}
                  </div>
                  {o.badge && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary shrink-0">
                      {o.badge}
                    </span>
                  )}
                  {active && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
