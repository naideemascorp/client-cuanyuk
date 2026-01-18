import { Show } from "solid-js";

export type ToastState = { id: number; kind: "progress" | "success" | "error"; message: string } | null;

export function Toast(props: { toast: ToastState; onClose: () => void }) {
  return (
    <Show when={props.toast} keyed>
      {(t) => (
        <div class="toastWrap" role="status" aria-live="polite">
          <div class={`toast toast--${t.kind}`}>
            <div class="toastLeft">
              <Show when={t.kind === "progress"}>
                <span class="spinner" />
              </Show>
              <div class="toastMsg">{t.message}</div>
            </div>
            <button class="toastClose" type="button" onClick={props.onClose} aria-label="Close">
              ×
            </button>
            <div class="toastBar">
              <div class="toastBarFill" />
            </div>
          </div>
        </div>
      )}
    </Show>
  );
}
