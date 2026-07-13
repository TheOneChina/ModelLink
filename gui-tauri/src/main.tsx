import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import App from "./App";
import "@/index.css";

async function bootstrap() {
  // 纯浏览器预览（无 Tauri 运行时）时挂 IPC mock；生产构建摇树剔除
  if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)) {
    await import("@/lib/devPreview");
  }

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

void bootstrap();
