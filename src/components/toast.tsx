import { Show } from "solid-js";

export type ToastKind = "progress" | "success" | "error";

export type ToastState = {
  id: number;
  kind: ToastKind;
  message: string;
  durationMs?: number | null;
  progress?: number | null;
} | null;

export function Toast(props: { toast: ToastState; onClose: () => void }) {
  const titleFor = (kind: ToastKind) => {
    if (kind === "progress") return "Working";
    if (kind === "success") return "Success";
    return "Error";
  };

  return (
    <Show when={props.toast} keyed>
      {(t) => (
        <output class="toastWrap" aria-live="polite">
          <div class={`toast toast--${t.kind}`}>
            <div class="toastLeft">
              <div class="toastIcon" aria-hidden="true">
                <Show
                  when={t.kind !== "progress"}
                  fallback={<span class="spinner" style="width: 16px; height: 16px" />}
                >
                  <Show
                    when={t.kind === "success"}
                    fallback={
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <title>Error</title>
                        <path d="M18 6 6 18" />
                        <path d="M6 6l12 12" />
                      </svg>
                    }
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <title>Success</title>
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </Show>
                </Show>
              </div>
              <div class="toastText">
                <div class="toastTitle">{titleFor(t.kind)}</div>
                <div class="toastBody">{t.message}</div>
              </div>
            </div>
            <button class="toastClose" type="button" onClick={props.onClose} aria-label="Close">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <title>Close</title>
                <path d="M18 6 6 18" />
                <path d="M6 6l12 12" />
              </svg>
            </button>
            <div class="toastBar" aria-hidden="true">
              <Show when={t.kind === "progress"}>
                <Show
                  when={typeof t.progress === "number"}
                  fallback={<div class="toastBarIndeterminate" />}
                >
                  <div
                    class="toastBarFillStatic"
                    style={{ width: `${Math.max(0, Math.min(100, t.progress ?? 0))}%` }}
                  />
                </Show>
              </Show>
              <Show when={t.kind !== "progress"}>
                <div
                  class="toastBarFill"
                  style={{ "animation-duration": `${t.durationMs ?? 5000}ms` }}
                />
              </Show>
            </div>
          </div>
        </output>
      )}
    </Show>
  );
}
