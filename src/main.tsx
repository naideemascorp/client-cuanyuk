import { App } from "@/app";
import { render } from "solid-js/web";
import "@/styles/global.css";

const isProbablyTauri = () => {
  const w = globalThis as unknown as Record<string, unknown>;
  if (typeof w.__TAURI__ !== "undefined") return true;
  if (typeof w.__TAURI_INTERNALS__ !== "undefined") return true;
  const ua = globalThis.navigator?.userAgent ?? "";
  return /\btauri\b/i.test(ua);
};

const isStandaloneDisplayMode = () => {
  const n = globalThis.navigator as unknown as { standalone?: boolean } | undefined;
  if (n?.standalone) return true;
  const mm = globalThis.matchMedia?.("(display-mode: standalone)");
  return Boolean(mm?.matches);
};

const setHostMode = () => {
  const hostMode = isProbablyTauri() || isStandaloneDisplayMode() ? "app" : "browser";
  document.documentElement.dataset.host = hostMode;
  return hostMode;
};

const disableZoomGestures = () => {
  const meta = document.querySelector('meta[name="viewport"]');
  if (meta) {
    const base = "width=device-width, initial-scale=1.0";
    meta.setAttribute("content", `${base}, maximum-scale=1, user-scalable=no`);
  }

  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) e.preventDefault();
  };
  document.addEventListener("wheel", onWheel, { passive: false });

  const onKeyDown = (e: KeyboardEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    const k = e.key;
    if (k === "+" || k === "=" || k === "-" || k === "0") e.preventDefault();
  };
  document.addEventListener("keydown", onKeyDown);

  const prevent = (e: Event) => e.preventDefault();
  document.addEventListener("gesturestart", prevent as EventListener, { passive: false });
  document.addEventListener("gesturechange", prevent as EventListener, { passive: false });
  document.addEventListener("gestureend", prevent as EventListener, { passive: false });
};

const hostMode = setHostMode();
if (hostMode === "app") disableZoomGestures();

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");
render(() => <App />, root);
