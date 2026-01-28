import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  useContext,
} from "solid-js";
import type { ParentComponent } from "solid-js";

export type ThemePreference = "system" | "light" | "dark" | "black";
export type EffectiveTheme = "light" | "dark" | "black";

type ThemeContextValue = {
  preference: () => ThemePreference;
  setPreference: (next: ThemePreference) => void;
  effective: () => EffectiveTheme;
};

const ThemeContext = createContext<ThemeContextValue>();

const safeLocalStorageGet = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeLocalStorageSet = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};

export const ThemeProvider: ParentComponent = (props) => {
  const initial = (() => {
    const raw = (safeLocalStorageGet("theme_preference") ?? "system").trim().toLowerCase();
    if (raw === "light" || raw === "dark" || raw === "black" || raw === "system") return raw;
    return "system";
  })();

  const [preference, setPreference] = createSignal<ThemePreference>(initial);
  const [systemDark, setSystemDark] = createSignal(false);

  createEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    setSystemDark(Boolean(mq.matches));
    const handler = (e: MediaQueryListEvent) => setSystemDark(Boolean(e.matches));
    mq.addEventListener("change", handler);
    onCleanup(() => mq.removeEventListener("change", handler));
  });

  const effective = createMemo<EffectiveTheme>(() => {
    const pref = preference();
    if (pref === "system") return systemDark() ? "dark" : "light";
    if (pref === "black") return "black";
    if (pref === "dark") return "dark";
    return "light";
  });

  createEffect(() => {
    const pref = preference();
    safeLocalStorageSet("theme_preference", pref);
    const root = document.documentElement;
    root.dataset.themePref = pref;
    root.dataset.theme = effective();
  });

  return (
    <ThemeContext.Provider value={{ preference, setPreference, effective }}>
      {props.children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("ThemeProvider is missing.");
  return ctx;
};
