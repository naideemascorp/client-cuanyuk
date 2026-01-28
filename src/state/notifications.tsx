import { useAuth } from "@/state/auth";
import { api } from "@/utils/api";
import {
  type JSX,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  useContext,
} from "solid-js";

export type NotificationImportance = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type NotificationEntry = {
  id: string;
  title: string;
  description: string;
  importance: NotificationImportance;
  publishAt: string;
};

type NotificationsApi = {
  notifications: () => NotificationEntry[];
  unreadCount: () => number;
  readAt: () => string | null;
  loading: () => boolean;
  refresh: () => Promise<void>;
  markRead: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsApi>();

export function NotificationsProvider(props: { children: JSX.Element }) {
  const auth = useAuth();

  const [notifications, setNotifications] = createSignal<NotificationEntry[]>([]);
  const [unreadCount, setUnreadCount] = createSignal(0);
  const [readAt, setReadAt] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);
  const isReady = createMemo(() => !auth.loading() && Boolean(auth.me()));
  let nextTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

  const refresh = async () => {
    if (!isReady()) return;
    setLoading(true);
    try {
      const res = await api.get<{
        notifications: Array<{
          id: string;
          title: string;
          description: string;
          importance: NotificationImportance;
          publishAt: string;
        }>;
        unreadCount: number;
        readAt?: string | null;
        nextPublishAt?: string | null;
      }>("/notifications");
      setNotifications(res.notifications ?? []);
      setUnreadCount(Math.max(0, Number(res.unreadCount ?? 0)));
      setReadAt(typeof res.readAt === "string" ? res.readAt : null);

      if (nextTimer) globalThis.clearTimeout(nextTimer);
      nextTimer = null;
      const nextRaw = res.nextPublishAt ?? null;
      if (nextRaw) {
        const ms = new Date(nextRaw).getTime();
        if (Number.isFinite(ms)) {
          const delay = ms - Date.now();
          if (delay > 0 && delay < 31 * 24 * 60 * 60 * 1000) {
            nextTimer = globalThis.setTimeout(
              () => {
                void refresh();
              },
              Math.min(24 * 60 * 60 * 1000, delay + 250),
            );
          }
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const markRead = async () => {
    if (!isReady()) return;
    await api.post<Record<string, never>>("/notifications/read", {});
    await refresh();
  };

  createEffect(() => {
    if (!isReady()) {
      setNotifications([]);
      setUnreadCount(0);
      setReadAt(null);
      if (nextTimer) globalThis.clearTimeout(nextTimer);
      nextTimer = null;
      return;
    }
    void refresh();
    const id = globalThis.setInterval(() => {
      void refresh();
    }, 25_000);
    onCleanup(() => {
      globalThis.clearInterval(id);
      if (nextTimer) globalThis.clearTimeout(nextTimer);
      nextTimer = null;
    });
  });

  const value: NotificationsApi = {
    notifications,
    unreadCount,
    readAt,
    loading,
    refresh,
    markRead,
  };
  return (
    <NotificationsContext.Provider value={value}>{props.children}</NotificationsContext.Provider>
  );
}

export const useNotifications = () => {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("NotificationsContext missing");
  return ctx;
};
