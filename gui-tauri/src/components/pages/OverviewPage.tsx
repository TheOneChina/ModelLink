import { ApplyStatusArea } from "@/components/ApplyStatus";
import { LinkBoard } from "@/components/LinkBoard";
import { PresetGrid } from "@/components/PresetGrid";
import { RecentRequests } from "@/components/RecentRequests";
import { flattenModels, formatAppliedAt } from "@/lib/presets";
import { useAppStore } from "@/lib/store";

/** 概览页（design.md §6.1）；零服务商时变引导页（§7）。 */
export function OverviewPage() {
  const { draft, addProviderFromPreset } = useAppStore();

  // 空状态：概览页即引导
  if (draft && draft.providers.length === 0) {
    return (
      <>
        <header className="flex items-end justify-between gap-3.5 px-6 pb-3.5 pt-[46px]">
          <div>
            <h1 className="text-[19px] font-[650] leading-[1.25] tracking-[-0.01em]">
              选择一个服务商开始
            </h1>
            <p className="mt-[3px] text-xs text-muted-foreground">
              配置 API 密钥后，一键接入 Claude Desktop
            </p>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-6 pb-6 pt-0.5">
          <PresetGrid onPick={addProviderFromPreset} />
          <div className="rounded-[8px] border border-dashed p-[9px] text-center text-[11.5px] text-faint">
            接入后，这里会显示 Claude 槽位 → 实际模型的链路板
          </div>
        </div>
      </>
    );
  }

  const flat = draft ? flattenModels(draft) : [];
  const appliedAt = formatAppliedAt(draft?.last_applied_at);

  return (
    <>
      <header className="flex items-end justify-between gap-3.5 px-6 pb-3.5 pt-[46px]">
        <div>
          <h1 className="text-[19px] font-[650] leading-[1.25] tracking-[-0.01em]">概览</h1>
          <p className="mt-[3px] text-xs text-muted-foreground">
            <span className="mono">{flat.length}</span> 个模型 ·{" "}
            <span className="mono">{draft?.providers.length ?? 0}</span> 个服务商
            {appliedAt && (
              <>
                {" "}
                · 上次应用 <span className="mono text-faint">{appliedAt}</span>
              </>
            )}
          </p>
        </div>
        <ApplyStatusArea />
      </header>
      <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-6 pb-6 pt-0.5">
        <LinkBoard />
        <RecentRequests />
      </div>
    </>
  );
}
