import { useNotifications } from "@/state/notifications";
import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";

const formatDateTime = (raw: string) => {
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return raw;
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString();
  }
};

const severityText = (v: string) =>
  v === "LOW"
    ? "Low"
    : v === "MEDIUM"
      ? "Medium"
      : v === "HIGH"
        ? "High"
        : v === "CRITICAL"
          ? "Critical"
          : v;

export function NotificationBell() {
  const n = useNotifications();
  const [open, setOpen] = createSignal(false);
  const [pos, setPos] = createSignal<{ top: number; right: number }>({ top: 70, right: 18 });
  let wrapEl: HTMLDivElement | undefined;
  let buttonEl: HTMLButtonElement | undefined;

  const isUnread = (publishAt: string) => {
    const readAt = n.readAt();
    if (!readAt) return true;
    const pubMs = new Date(publishAt).getTime();
    const readMs = new Date(readAt).getTime();
    if (!Number.isFinite(pubMs) || !Number.isFinite(readMs)) return true;
    return pubMs > readMs;
  };

  createEffect(() => {
    if (!open()) return;
    void n.markRead();
  });

  createEffect(() => {
    if (!open()) return;
    const update = () => {
      const btn = buttonEl;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const top = Math.round(rect.bottom + 10);
      const right = Math.max(12, Math.round(globalThis.innerWidth - rect.right));
      setPos({ top, right });
    };
    update();
    globalThis.addEventListener("resize", update);
    globalThis.addEventListener("scroll", update, true);
    onCleanup(() => {
      globalThis.removeEventListener("resize", update);
      globalThis.removeEventListener("scroll", update, true);
    });
  });

  createEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!open()) return;
      const el = wrapEl;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      setOpen(false);
    };
    globalThis.addEventListener("mousedown", onDown);
    onCleanup(() => globalThis.removeEventListener("mousedown", onDown));
  });

  return (
    <div
      ref={(el) => {
        wrapEl = el;
      }}
      style="position: relative"
    >
      <button
        class="iconBtn"
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
        ref={(el) => {
          buttonEl = el;
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <title>Notifications</title>
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        <Show when={n.unreadCount() > 0}>
          <span class="notifBadge">{Math.min(99, n.unreadCount())}</span>
        </Show>
      </button>

      <Show when={open()}>
        <div class="notifPanel" style={{ top: `${pos().top}px`, right: `${pos().right}px` }}>
          <div class="notifHeader">
            <div class="notifTitle">Updates</div>
            <button
              class="notifClose"
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
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
          </div>
          <div class="notifList">
            <Show
              when={n.notifications().length > 0}
              fallback={
                <div style="color: rgba(250,250,255,0.66); font-size: 13px; padding: 14px 12px">
                  No updates yet.
                </div>
              }
            >
              <For each={n.notifications().slice(0, 10)}>
                {(it) => (
                  <div
                    class={`notifItem ${isUnread(it.publishAt) ? "notifItem--unread" : "notifItem--read"}`}
                  >
                    <div class="notifRow">
                      <span class={`importancePill importancePill--${it.importance}`}>
                        {severityText(it.importance)}
                      </span>
                      <span class="notifWhen">{formatDateTime(it.publishAt)}</span>
                    </div>
                    <div class="notifItemTitle">{it.title}</div>
                    <div class="notifItemDesc">{it.description}</div>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
