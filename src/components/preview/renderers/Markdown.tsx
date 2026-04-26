// Premium markdown renderer:
//   - GFM (tables, task lists, strikethrough, autolinks)
//   - Math (KaTeX) via remark-math + rehype-katex
//   - Code highlighting via rehype-highlight (highlight.js theme)
//   - Mermaid diagrams (```mermaid blocks render to SVG)
//   - Auto-generated TOC sidebar from h1/h2/h3 headings
//   - Reading-progress bar

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";

export function MarkdownRenderer({ text }: { text: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [activeId, setActiveId] = useState<string>("");

  const headings = useMemo(() => extractHeadings(text), [text]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    setProgress(max > 0 ? el.scrollTop / max : 0);

    // active heading: closest above the top
    let active = "";
    for (const h of headings) {
      const node = document.getElementById(h.id);
      if (!node) continue;
      const top = node.getBoundingClientRect().top;
      if (top < 80) active = h.id;
    }
    if (active) setActiveId(active);
  };

  return (
    <div className="w-full h-full flex bg-background overflow-hidden">
      {/* TOC */}
      {headings.length > 0 && (
        <aside className="hidden md:flex w-56 shrink-0 border-r border-border/40 flex-col">
          <div className="px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground border-b border-border/40">
            目录
          </div>
          <nav className="flex-1 overflow-y-auto scrollbar-thin py-2">
            {headings.map((h) => (
              <a
                key={h.id}
                href={`#${h.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  document
                    .getElementById(h.id)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className={`block text-xs px-4 py-1.5 truncate transition-colors ${
                  activeId === h.id
                    ? "text-primary border-l-2 border-primary bg-primary/5 font-medium"
                    : "text-muted-foreground hover:text-foreground border-l-2 border-transparent"
                }`}
                style={{ paddingLeft: `${1 + h.depth * 0.6}rem` }}
              >
                {h.text}
              </a>
            ))}
          </nav>
        </aside>
      )}

      {/* main */}
      <div className="flex-1 relative overflow-hidden">
        <div
          className="absolute top-0 left-0 right-0 h-0.5 bg-primary z-10 origin-left transition-transform"
          style={{ transform: `scaleX(${progress})` }}
        />
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="h-full overflow-y-auto scrollbar-thin"
        >
          <article className="prose prose-slate dark:prose-invert prose-sm md:prose-base max-w-3xl mx-auto px-8 py-10 prose-pre:my-3 prose-pre:bg-[#0d1117] prose-pre:border prose-pre:border-white/5 prose-headings:scroll-mt-20">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex, rehypeHighlight]}
              components={{
                code({ className, children, ...props }: any) {
                  const lang = /language-(\w+)/.exec(className || "")?.[1];
                  if (lang === "mermaid") {
                    return <Mermaid code={String(children)} />;
                  }
                  return (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                },
                h1: (props: any) => <Heading depth={1} {...props} />,
                h2: (props: any) => <Heading depth={2} {...props} />,
                h3: (props: any) => <Heading depth={3} {...props} />,
                h4: (props: any) => <Heading depth={4} {...props} />,
                a: ({ href, children }: any) => (
                  <a href={href} target="_blank" rel="noreferrer">
                    {children}
                  </a>
                ),
              }}
            >
              {text}
            </ReactMarkdown>
          </article>
        </div>
      </div>
    </div>
  );
}

function Heading({ depth, children }: { depth: number; children: React.ReactNode }) {
  const text = childrenToString(children);
  const id = slugify(text);
  const Tag = `h${depth}` as keyof JSX.IntrinsicElements;
  return (
    <Tag id={id} className="group">
      <a href={`#${id}`} className="no-underline">
        {children}
      </a>
    </Tag>
  );
}

function childrenToString(c: React.ReactNode): string {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map(childrenToString).join("");
  if (typeof c === "object" && c && "props" in (c as any)) {
    return childrenToString((c as any).props.children);
  }
  return "";
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

function extractHeadings(md: string): { depth: number; text: string; id: string }[] {
  const out: { depth: number; text: string; id: string }[] = [];
  const re = /^(#{1,6})\s+(.+?)\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    const depth = m[1].length;
    if (depth > 4) continue;
    const text = m[2].replace(/`([^`]+)`/g, "$1");
    out.push({ depth, text, id: slugify(text) });
  }
  return out;
}

// Mermaid lazy-loaded so it's not in the main bundle.
function Mermaid({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const id = useMemo(() => `mmd-${Math.random().toString(36).slice(2)}`, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, theme: "default", securityLevel: "loose" });
        const { svg } = await mermaid.render(id, code);
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, id]);

  if (error) {
    return (
      <pre className="text-xs text-rose-500 bg-rose-500/10 p-3 rounded">
        Mermaid 渲染失败：{error}
        {"\n\n"}
        {code}
      </pre>
    );
  }
  return <div ref={ref} className="my-4 flex justify-center" />;
}
