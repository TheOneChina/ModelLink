import { useQuery, useQueryClient } from "@tanstack/react-query";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GITHUB_URL } from "@/lib/constants";
import { guiVersion } from "@/lib/ipc";
import { useTheme, type ThemePref } from "@/lib/theme";
import { useUpdaterCtx } from "@/lib/updaterContext";

const THEME_TABS: { value: ThemePref; label: string }[] = [
  { value: "light", label: "亮色" },
  { value: "dark", label: "深色" },
  { value: "system", label: "跟随系统" },
];

/** 设置页（design.md §6.4）：外观 / 开机自启 / 软件更新 / 关于，单卡片四行。 */
export function SettingsPage() {
  const { pref, setPref } = useTheme();
  const updater = useUpdaterCtx();
  const qc = useQueryClient();

  const versionQ = useQuery({ queryKey: ["gui-version"], queryFn: guiVersion });
  const autostartQ = useQuery({ queryKey: ["autostart"], queryFn: () => isEnabled() });

  const toggleAutostart = async (ck: boolean) => {
    try {
      if (ck) await enable();
      else await disable();
    } catch (e) {
      toast.error(`设置开机自启失败：${String(e)}`);
    }
    await qc.invalidateQueries({ queryKey: ["autostart"] });
  };

  const version = versionQ.data ?? "";
  const updateSub = updater.state.hasUpdate
    ? `当前 ${version} · 发现新版本 v${updater.state.newVersion}`
    : updater.checked
      ? `当前 ${version} · 已是最新版本`
      : `当前 ${version}`;

  return (
    <>
      <header className="flex items-end justify-between gap-3.5 px-6 pb-3.5 pt-[46px]">
        <div>
          <h1 className="text-[19px] font-[650] leading-[1.25] tracking-[-0.01em]">设置</h1>
        </div>
      </header>

      <div className="flex flex-1 flex-col overflow-y-auto px-6 pb-6 pt-0.5">
        <div className="max-w-[470px] rounded-xl border bg-card">
          {/* 外观 */}
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-[13px] font-medium">外观</div>
            </div>
            <Tabs value={pref} onValueChange={(v) => setPref(v as ThemePref)}>
              <TabsList className="h-auto gap-[2px] rounded-[9px] border bg-background p-[2px]">
                {THEME_TABS.map((t) => (
                  <TabsTrigger
                    key={t.value}
                    value={t.value}
                    className="rounded-[7px] border-none px-2.5 py-1 text-[11.5px] text-muted-foreground data-[state=active]:bg-card data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-[0_1px_3px_rgba(0,0,0,.12)] dark:data-[state=active]:shadow-none"
                  >
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {/* 开机自启 */}
          <div className="flex items-center justify-between border-t px-4 py-3">
            <div>
              <div className="text-[13px] font-medium">开机自启</div>
              <div className="mt-px text-[11px] text-faint">登录时自动启动代理</div>
            </div>
            <Switch
              checked={autostartQ.data ?? false}
              onCheckedChange={(ck) => void toggleAutostart(ck)}
            />
          </div>

          {/* 软件更新 */}
          <div className="flex items-center justify-between border-t px-4 py-3">
            <div>
              <div className="text-[13px] font-medium">软件更新</div>
              <div className="mt-px text-[11px] text-faint">
                <span className="mono">{updateSub}</span>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => void updater.manualCheck()}
              disabled={updater.state.isChecking}
              className="h-[29px] rounded-[9px] bg-card px-3 text-xs font-medium shadow-none dark:border-border dark:bg-card"
            >
              {updater.state.isChecking && <Loader2 size={12} className="animate-spin" />}
              检查更新
            </Button>
          </div>

          {/* 关于 */}
          <div className="flex items-center justify-between border-t px-4 py-3">
            <div>
              <div className="text-[13px] font-medium">关于</div>
              <div className="mt-px text-[11px] text-faint">
                ModelLink by Winhao学AI · 免费软件 · 不可商业化
              </div>
            </div>
            <button
              onClick={() => void openUrl(GITHUB_URL)}
              className="flex items-center gap-[5px] text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
            >
              GitHub
              <ExternalLink size={11} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
