import type { ToastKind, ToastState } from "@/components/toast";
import { type JSX, createContext, createSignal, onCleanup, useContext } from "solid-js";

type ToastApi = {
  toast: () => ToastState;
  showToast: (
    kind: ToastKind,
    message: string,
    opts?: { durationMs?: number | null; progress?: number | null },
  ) => void;
  closeToast: () => void;
};

const ToastContext = createContext<ToastApi>();

export function ToastProvider(props: { children: JSX.Element }) {
  const [toast, setToast] = createSignal<ToastState>(null);
  let timer: ReturnType<typeof globalThis.setTimeout> | null = null;

  const closeToast = () => {
    if (timer) globalThis.clearTimeout(timer);
    timer = null;
    setToast(null);
  };

  const showToast: ToastApi["showToast"] = (kind, message, opts) => {
    if (timer) globalThis.clearTimeout(timer);
    timer = null;
    const durationMs = opts?.durationMs ?? (kind === "progress" ? null : 5000);
    const next: NonNullable<ToastState> = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      kind,
      message,
      durationMs,
      progress: typeof opts?.progress === "number" ? opts.progress : null,
    };
    setToast(next);
    if (durationMs && durationMs > 0) {
      timer = globalThis.setTimeout(() => setToast(null), durationMs);
    }
  };

  onCleanup(() => {
    if (timer) globalThis.clearTimeout(timer);
  });

  const value: ToastApi = { toast, showToast, closeToast };
  return <ToastContext.Provider value={value}>{props.children}</ToastContext.Provider>;
}

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("ToastContext missing");
  return ctx;
};
