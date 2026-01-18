import { JSX, Show, createEffect, onCleanup } from "solid-js";

export const Modal = (props: { open: boolean; onClose: () => void; children: JSX.Element }) => {
  createEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  return (
    <Show when={props.open}>
      <div
        style={{
          position: "fixed",
          inset: "0",
          "z-index": "50",
          display: "grid",
          "place-items": "center",
          padding: "18px",
          background: "rgba(0,0,0,0.55)",
          "backdrop-filter": "blur(10px)"
        }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) props.onClose();
        }}
      >
        <div
          class="card"
          style={{
            width: "min(980px, 100%)",
            "border-radius": "22px"
          }}
        >
          <div class="cardInner">{props.children}</div>
        </div>
      </div>
    </Show>
  );
};

