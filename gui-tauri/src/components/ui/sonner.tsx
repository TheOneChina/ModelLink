import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

import { useTheme } from "@/lib/theme";

const Toaster = ({ ...props }: ToasterProps) => {
  const { dark } = useTheme();

  return (
    <Sonner
      theme={dark ? "dark" : "light"}
      className="toaster group"
      // 类型着色（2026-07-14 用户调整）：richColors 通道映射到本项目色板 token，
      // 成功=success 青绿 / 失败=destructive 红 / 警告=warning 琥珀，双主题自适应
      richColors
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: { toast: "backdrop-blur-md" },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius-lg)",
          "--success-bg": "var(--success-soft)",
          "--success-text": "var(--success)",
          "--success-border": "var(--success-soft)",
          "--error-bg": "var(--destructive-soft)",
          "--error-text": "var(--destructive)",
          "--error-border": "var(--destructive-soft)",
          "--warning-bg": "var(--warning-soft)",
          "--warning-text": "var(--warning)",
          "--warning-border": "var(--warning-soft)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
