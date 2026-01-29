import { type JSX, Show, createEffect, onCleanup } from "solid-js";

export const Modal = (props: { open: boolean; onClose: () => void; children: JSX.Element }) => {
  createEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    globalThis.addEventListener("keydown", onKey);
    onCleanup(() => globalThis.removeEventListener("keydown", onKey));
  });

  return (
    <Show when={props.open}>
      <div
        class="modalOverlay"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) props.onClose();
        }}
      >
        <div class="card modalCard">
          <div class="cardInner modalCardInner">{props.children}</div>
        </div>
      </div>
    </Show>
  );
};
