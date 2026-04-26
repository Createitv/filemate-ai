import { convertFileSrc } from "@tauri-apps/api/core";

export function PdfRenderer({ path }: { path: string }) {
  return (
    <iframe
      src={convertFileSrc(path) + "#view=FitH"}
      className="w-full h-full border-0 bg-white"
      title="PDF"
    />
  );
}
