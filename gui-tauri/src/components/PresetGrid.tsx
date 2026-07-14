import { ProviderAvatar, presetLogo } from "@/components/ProviderAvatar";
import { PRESETS, presetHost, type Preset } from "@/lib/presets";

// 预设短名（design.md §7 网格 tile 文案；创建服务商仍用 PRESETS 完整数据）
const SHORT_NAMES: Record<string, string> = {
  deepseek: "DeepSeek",
  "kimi-code": "Kimi Code",
  kimi: "Kimi 开放平台",
  minimax: "MiniMax",
  "qwen-coding": "百炼 Coding",
  "qwen-token": "百炼 Token",
  glm: "GLM（智谱）",
  mimo: "mimo",
};

/** 3×3 预设网格（8 预设 + 自定义），用于首启引导页与「添加服务商」Dialog。 */
export function PresetGrid({ onPick }: { onPick: (p: Preset | "custom") => void }) {
  return (
    <div className="grid grid-cols-3 gap-[9px]">
      {PRESETS.map((p) => {
        const name = SHORT_NAMES[p.id] ?? p.name;
        return (
          <button
            key={p.id}
            onClick={() => onPick(p)}
            className="flex items-center gap-[9px] rounded-[11px] border bg-card px-3 py-[11px] text-left transition-colors hover:border-primary/50"
          >
            <ProviderAvatar logo={presetLogo(p.id)} letter={name[0]} />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold leading-[1.3] text-foreground">
                {name}
              </span>
              <span className="mono block truncate text-[9px] text-faint">{presetHost(p)}</span>
            </span>
          </button>
        );
      })}
      <button
        onClick={() => onPick("custom")}
        className="flex items-center gap-[9px] rounded-[11px] border border-dashed bg-card px-3 py-[11px] text-left transition-colors hover:border-primary/50"
      >
        <span className="flex size-[26px] flex-none items-center justify-center rounded-full bg-background text-[11px] font-bold text-faint">
          ?
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold leading-[1.3] text-foreground">自定义</span>
          <span className="mono block truncate text-[9px] text-faint">手动填写地址</span>
        </span>
      </button>
    </div>
  );
}
