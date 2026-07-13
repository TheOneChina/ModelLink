import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// 主题三态（design.md §2）：.dark class + localStorage；跟随系统用 matchMedia 监听。
export type ThemePref = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

function readPref(): ThemePref {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" ? v : "system";
}

function isDark(pref: ThemePref): boolean {
  return (
    pref === "dark" ||
    (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  );
}

type ThemeCtx = {
  pref: ThemePref;
  dark: boolean;
  setPref: (p: ThemePref) => void;
};

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(readPref);
  const [dark, setDark] = useState(() => isDark(readPref()));

  const apply = useCallback((p: ThemePref) => {
    const d = isDark(p);
    document.documentElement.classList.toggle("dark", d);
    setDark(d);
  }, []);

  const setPref = useCallback(
    (p: ThemePref) => {
      localStorage.setItem(STORAGE_KEY, p);
      setPrefState(p);
      apply(p);
    },
    [apply],
  );

  useEffect(() => {
    apply(pref);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (readPref() === "system") apply("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref, apply]);

  return <Ctx.Provider value={{ pref, dark, setPref }}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
