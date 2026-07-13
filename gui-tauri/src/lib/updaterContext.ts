import { createContext, useContext } from "react";

import type { UpdateState } from "@/lib/useUpdater";

// App 持有 updater 实例（全局弹窗）；设置页通过此 context 触发手动检查。
export type UpdaterCtxValue = {
  state: UpdateState;
  /** 手动检查（无视「跳过/冷却」抑制；无更新时 toast 提示）。 */
  manualCheck: () => Promise<void>;
  /** 本次会话是否已完成过一次检查（决定「已是最新版本」副行）。 */
  checked: boolean;
};

export const UpdaterCtx = createContext<UpdaterCtxValue | null>(null);

export function useUpdaterCtx(): UpdaterCtxValue {
  const ctx = useContext(UpdaterCtx);
  if (!ctx) throw new Error("useUpdaterCtx must be used within App");
  return ctx;
}
