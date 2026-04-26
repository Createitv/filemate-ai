import { convertFileSrc } from "@tauri-apps/api/core";

export function VideoRenderer({ path }: { path: string }) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-black">
      <video
        src={convertFileSrc(path)}
        controls
        className="max-w-full max-h-full"
        autoPlay={false}
      />
    </div>
  );
}
