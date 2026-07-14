import { matchPreset } from "@/lib/presets";

import bailian from "@/assets/providers/bailian.svg";
import deepseek from "@/assets/providers/deepseek.svg";
import kimi from "@/assets/providers/kimi.svg";
import minimax from "@/assets/providers/minimax.svg";
import xiaomimimo from "@/assets/providers/xiaomimimo.svg";
import zhipu from "@/assets/providers/zhipu.svg";

// 品牌图标（@lobehub/icons-static-svg，MIT，与 cc-switch 同源）按预设 id 映射。
// Kimi 官方为「白字形+蓝点」，须配黑底；其余用白底。
export type ProviderLogo = { src: string; bg?: string };

const KIMI: ProviderLogo = { src: kimi, bg: "#000" };
const LOGO_BY_PRESET: Record<string, ProviderLogo> = {
  deepseek: { src: deepseek },
  "kimi-code": KIMI,
  kimi: KIMI,
  minimax: { src: minimax },
  "qwen-coding": { src: bailian },
  "qwen-token": { src: bailian },
  glm: { src: zhipu },
  mimo: { src: xiaomimimo },
};

export function presetLogo(presetId: string): ProviderLogo | undefined {
  return LOGO_BY_PRESET[presetId];
}

export function logoForUrl(url: string): ProviderLogo | undefined {
  const p = matchPreset(url);
  return p ? LOGO_BY_PRESET[p.id] : undefined;
}

/**
 * 服务商头像：有品牌图标 → 白底（或品牌底色）圆 + logo；无（自定义）→ primary-soft 底 + 首字母。
 */
export function ProviderAvatar({
  logo,
  letter,
  size = 26,
}: {
  logo?: ProviderLogo;
  letter: string;
  size?: number;
}) {
  if (logo) {
    return (
      <span
        className="flex flex-none items-center justify-center rounded-full border border-black/[.08]"
        style={{ width: size, height: size, background: logo.bg ?? "#fff" }}
      >
        <img
          src={logo.src}
          alt=""
          draggable={false}
          style={{ width: Math.round(size * 0.62), height: Math.round(size * 0.62) }}
        />
      </span>
    );
  }
  return (
    <span
      className="flex flex-none items-center justify-center rounded-full bg-primary-soft font-bold text-primary"
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.42)) }}
    >
      {letter}
    </span>
  );
}
