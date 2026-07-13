import { QueryClient } from "@tanstack/react-query";

// 本地 IPC 数据：不会自己过期，靠 mutation 后显式 invalidate 刷新。
// （日志页的 2s 轮询由该 query 自带 refetchInterval 覆盖此默认值。）
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});
