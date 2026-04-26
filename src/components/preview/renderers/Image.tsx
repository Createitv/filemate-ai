import { useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, Maximize2, RotateCw, Move } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";

export function ImageRenderer({ path }: { path: string }) {
  const url = convertFileSrc(path);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [rotation, setRotation] = useState(0);
  const dragging = useRef<{ x: number; y: number } | null>(null);

  // reset on path change
  useEffect(() => {
    setScale(1);
    setTx(0);
    setTy(0);
    setRotation(0);
  }, [path]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((s) => Math.max(0.1, Math.min(20, s * delta)));
  };

  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = { x: e.clientX - tx, y: e.clientY - ty };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return;
    setTx(e.clientX - dragging.current.x);
    setTy(e.clientY - dragging.current.y);
  };
  const onMouseUp = () => {
    dragging.current = null;
  };

  const fit = () => {
    setScale(1);
    setTx(0);
    setTy(0);
  };

  return (
    <div
      className="relative w-full h-full overflow-hidden bg-[radial-gradient(circle_at_center,#1f2937,_#0b0e14)] select-none flex items-center justify-center"
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      style={{ cursor: dragging.current ? "grabbing" : "grab" }}
    >
      <img
        src={url}
        alt=""
        draggable={false}
        className="max-w-full max-h-full object-contain transition-transform duration-75"
        style={{
          transform: `translate(${tx}px, ${ty}px) scale(${scale}) rotate(${rotation}deg)`,
          transformOrigin: "center center",
        }}
      />

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-card/95 backdrop-blur border border-border/60 shadow-lg px-2 py-1.5">
        <ToolBtn onClick={() => setScale((s) => Math.max(0.1, s * 0.8))} title="缩小">
          <ZoomOut className="w-4 h-4" />
        </ToolBtn>
        <span className="px-2 text-xs tabular-nums text-muted-foreground w-14 text-center">
          {Math.round(scale * 100)}%
        </span>
        <ToolBtn onClick={() => setScale((s) => Math.min(20, s * 1.25))} title="放大">
          <ZoomIn className="w-4 h-4" />
        </ToolBtn>
        <div className="w-px h-4 bg-border" />
        <ToolBtn onClick={fit} title="适应窗口">
          <Maximize2 className="w-4 h-4" />
        </ToolBtn>
        <ToolBtn onClick={() => setRotation((r) => r + 90)} title="旋转 90°">
          <RotateCw className="w-4 h-4" />
        </ToolBtn>
        <ToolBtn onClick={() => { setTx(0); setTy(0); }} title="居中">
          <Move className="w-4 h-4" />
        </ToolBtn>
      </div>
    </div>
  );
}

function ToolBtn({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-7 h-7 rounded-full flex items-center justify-center text-foreground/80 hover:bg-accent/60"
    >
      {children}
    </button>
  );
}
