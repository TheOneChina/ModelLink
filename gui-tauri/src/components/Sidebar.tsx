import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layers, Link, ScrollText, SlidersHorizontal, Zap } from "lucide-react";

import { cn } from "@/lib/utils";
import { proxyStatus } from "@/lib/ipc";
import { useAppStore, type Page } from "@/lib/store";
import { useWatermark } from "@/lib/useWatermark";

const NAV: { key: Page; label: string; Icon: typeof Zap }[] = [
  { key: "overview", label: "概览", Icon: Zap },
  { key: "providers", label: "服务商", Icon: Layers },
  { key: "logs", label: "请求日志", Icon: ScrollText },
  { key: "settings", label: "设置", Icon: SlidersHorizontal },
];

/** 左侧 178px 导航栏（design.md §5）：品牌区 + 四导航 + 状态块 + 防篡改水印。 */
export function Sidebar() {
  const { page, setPage, applyState } = useAppStore();
  const wmHost = useRef<HTMLDivElement>(null);
  useWatermark(wmHost);

  const statusQ = useQuery({ queryKey: ["proxy-status"], queryFn: proxyStatus });
  const running = statusQ.data?.running ?? true;
  const port = statusQ.data?.port ?? 5678;

  const showDirtyDot = applyState === "dirty" || applyState === "error";

  return (
    <aside className="flex w-[178px] flex-none flex-col border-r border-sidebar-border bg-sidebar px-2.5 pt-11">
      <div className="flex items-center gap-2 px-2 pb-3.5">
        <span className="flex size-5 flex-none items-center justify-center rounded-[6px] bg-primary text-white">
          <Link size={11} strokeWidth={2.6} />
        </span>
        <span className="text-[14.5px] font-[650] tracking-[-0.01em] text-sidebar-foreground">
          ModelLink
        </span>
      </div>

      <nav className="flex flex-col">
        {NAV.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setPage(key)}
            className={cn(
              "relative mb-0.5 flex items-center gap-[9px] rounded-[8px] px-2.5 py-[7px] text-left text-[12.5px] font-medium text-muted-foreground transition-colors",
              page === key
                ? "bg-card font-semibold text-foreground shadow-[0_1px_3px_rgba(0,0,0,.07)] dark:shadow-none"
                : "hover:text-foreground",
            )}
          >
            <Icon size={14} className="flex-none opacity-85" />
            {label}
            {key === "overview" && showDirtyDot && (
              <span className="absolute right-2.5 size-1.5 rounded-full bg-warning" />
            )}
          </button>
        ))}
      </nav>

      <div className="flex-1" />

      <div className="flex flex-col gap-[3px] border-t border-sidebar-border px-2.5 pb-1 pt-[11px]">
        {running ? (
          <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-success">
            <span className="size-1.5 flex-none rounded-full bg-current" />
            代理运行中
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-warning">
            <span className="size-1.5 flex-none rounded-full bg-current" />
            代理未运行（端口被占）
          </div>
        )}
        <div className="mono pl-3 text-[10px] text-faint">127.0.0.1:{port}</div>
      </div>

      {/* 水印宿主：内容由 useWatermark 以命令式 DOM 维护（防篡改） */}
      <div ref={wmHost} />
    </aside>
  );
}
