// Code renderer with syntax highlighting (highlight.js), line numbers, and a
// scroll minimap on the right edge. Loads only the highlight.js core +
// auto-detection so we don't ship every grammar.

import { useEffect, useRef, useState } from "react";
import hljs from "highlight.js/lib/common";
import "highlight.js/styles/github-dark.css";

export function CodeRenderer({
  text,
  language,
}: {
  text: string;
  language?: string;
}) {
  const codeRef = useRef<HTMLElement>(null);
  const minimapRef = useRef<HTMLPreElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollPct, setScrollPct] = useState(0);

  useEffect(() => {
    const el = codeRef.current;
    if (!el) return;
    el.removeAttribute("data-highlighted");
    el.textContent = text;
    if (language && hljs.getLanguage(language)) {
      const result = hljs.highlight(text, { language });
      el.innerHTML = result.value;
    } else {
      const result = hljs.highlightAuto(text);
      el.innerHTML = result.value;
    }
  }, [text, language]);

  const lines = text.split("\n");

  return (
    <div className="w-full h-full flex bg-[#0d1117] text-slate-200 overflow-hidden">
      {/* line numbers */}
      <div className="px-3 py-4 text-right text-[11px] font-mono text-slate-600 select-none border-r border-white/5 overflow-hidden">
        {lines.map((_, i) => (
          <div key={i} className="leading-5">
            {i + 1}
          </div>
        ))}
      </div>

      {/* code */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto scrollbar-thin"
        onScroll={(e) => {
          const el = e.currentTarget;
          const max = el.scrollHeight - el.clientHeight;
          setScrollPct(max > 0 ? el.scrollTop / max : 0);
        }}
      >
        <pre className="p-4 text-[12.5px] leading-5 font-mono">
          <code ref={codeRef} className="hljs" />
        </pre>
      </div>

      {/* minimap */}
      <div className="relative w-20 border-l border-white/5 hidden lg:block">
        <pre
          ref={minimapRef}
          className="absolute inset-0 text-[2px] leading-[2.5px] font-mono text-slate-400 px-1 py-2 overflow-hidden whitespace-pre"
        >
          {text.slice(0, 12000)}
        </pre>
        <div
          className="absolute left-0 right-0 h-12 bg-primary/15 border border-primary/30 pointer-events-none"
          style={{ top: `calc(${scrollPct * 100}% - ${scrollPct * 48}px)` }}
        />
      </div>
    </div>
  );
}
