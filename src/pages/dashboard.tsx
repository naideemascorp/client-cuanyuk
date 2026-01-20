import { ImageDropzone } from "@/components/image-dropzone";
import { Modal } from "@/components/modal";
import { NotificationBell } from "@/components/notification-bell";
import type { ToastKind } from "@/components/toast";
import { useAuth } from "@/state/auth";
import { useToast } from "@/state/toast";
import { api } from "@/utils/api";
import { type RouteSectionProps, useNavigate } from "@solidjs/router";
import { For, Show, createEffect, createMemo, createSignal } from "solid-js";

type Merchant = { id: string; name: string; category: string; pictureUrl: string | null };
type PaymentItem = {
  id: string;
  kind: "LINK" | "QRIS";
  status: "ACTIVE" | "INACTIVE" | "PENDING" | "DELETED";
  totalAmount: number;
  paymentUrl: string | null;
  qrisUrl: string | null;
  expiresAt: string | null;
  createdDate: string;
  merchant: { id: string; name: string; category: string };
};

const computeWsBase = () => {
  const explicit = import.meta.env.VITE_WS_BASE_URL;
  const isHttpsPage =
    typeof globalThis.window !== "undefined" && globalThis.location?.protocol === "https:";
  if (explicit) {
    if (isHttpsPage && explicit.startsWith("ws://"))
      return `wss://${explicit.slice("ws://".length)}`;
    return explicit;
  }

  const apiBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";
  try {
    const u = new URL(apiBase);
    const wsProtocol = u.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${u.host}`;
  } catch {
    return isHttpsPage ? "wss://localhost:3001" : "ws://localhost:3001";
  }
};

const wsBase = computeWsBase();

const groupByCategory = (merchants: Merchant[]) => {
  const map = new Map<string, Merchant[]>();
  for (const m of merchants) {
    const k = m.category || "General";
    const arr = map.get(k) ?? [];
    arr.push(m);
    map.set(k, arr);
  }
  return Array.from(map.entries()).map(([category, ms]) => ({
    category,
    merchants: ms.slice().sort((a: Merchant, b: Merchant) => a.name.localeCompare(b.name)),
  }));
};

type DashboardProps = { publicToken?: string } & Partial<RouteSectionProps<unknown>>;

export default function Dashboard(props: DashboardProps) {
  const auth = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const publicToken = props.publicToken;
  const [merchants, setMerchants] = createSignal<Merchant[]>([]);
  const [items, setItems] = createSignal<PaymentItem[]>([]);
  const [notFound, setNotFound] = createSignal(false);
  const [selectedMerchant, setSelectedMerchant] = createSignal<Merchant | null>(null);
  const [tab, setTab] = createSignal<"LINK" | "QRIS">("LINK");

  const [newMerchantName, setNewMerchantName] = createSignal("");
  const [newMerchantCategory, setNewMerchantCategory] = createSignal("");
  const [newMerchantFile, setNewMerchantFile] = createSignal<File | null>(null);
  const [newCategoryName, setNewCategoryName] = createSignal("");
  const [categoriesList, setCategoriesList] = createSignal<{ id: string | null; name: string }[]>(
    [],
  );
  const [postKind, setPostKind] = createSignal<"LINK" | "QRIS">("LINK");
  const [postMerchantId, setPostMerchantId] = createSignal<string>("");
  const [postExpiration, setPostExpiration] = createSignal<string>("");
  const [postLink, setPostLink] = createSignal<string>("");
  const [postQrisFile, setPostQrisFile] = createSignal<File | null>(null);
  const [postTotalAmount, setPostTotalAmount] = createSignal<string>("");
  const [merchantUploadProgress, setMerchantUploadProgress] = createSignal<number | null>(null);
  const [qrisUploadProgress, setQrisUploadProgress] = createSignal<number | null>(null);
  const [touchedCategoryName, setTouchedCategoryName] = createSignal(false);
  const [touchedMerchantName, setTouchedMerchantName] = createSignal(false);
  const [touchedMerchantCategory, setTouchedMerchantCategory] = createSignal(false);
  const [touchedPaymentMerchant, setTouchedPaymentMerchant] = createSignal(false);
  const [touchedPaymentAmount, setTouchedPaymentAmount] = createSignal(false);
  const [touchedPaymentLink, setTouchedPaymentLink] = createSignal(false);
  const [touchedPaymentQris, setTouchedPaymentQris] = createSignal(false);
  const [action, setAction] = createSignal<{
    kind: "add_category" | "add_merchant" | "post" | "deactivate" | "signout";
    id?: string;
  } | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [syncing, setSyncing] = createSignal(false);
  let refreshInFlight: Promise<void> | null = null;
  const [openItemId, setOpenItemId] = createSignal<string | null>(null);
  const [nowMs, setNowMs] = createSignal(Date.now());
  const initialDashLoading = (() => {
    try {
      return sessionStorage.getItem("dash_loading") === "1";
    } catch {
      return false;
    }
  })();
  const [dashLoadingOverlay, setDashLoadingOverlay] = createSignal(initialDashLoading);
  const [dashLoadingStarted, setDashLoadingStarted] = createSignal(false);
  createEffect(() => {
    if (!dashLoadingOverlay()) return;
    const guardId = globalThis.setTimeout(() => {
      setDashLoadingOverlay(false);
      try {
        sessionStorage.removeItem("dash_loading");
      } catch {}
    }, 3500);
    if (loading()) setDashLoadingStarted(true);
    if (dashLoadingStarted() && !loading() && !syncing()) {
      setDashLoadingOverlay(false);
      try {
        sessionStorage.removeItem("dash_loading");
      } catch {}
    }
    return () => globalThis.clearTimeout(guardId);
  });

  const readOnly = createMemo(() => Boolean(publicToken));
  const [adminAccessLoading, setAdminAccessLoading] = createSignal(false);
  const [hasAdminAccess, setHasAdminAccess] = createSignal(false);
  const [adminChecked, setAdminChecked] = createSignal(false);
  createEffect(() => {
    if (readOnly()) return;
    if (auth.loading()) return;
    if (auth.me()) return;
    navigate("/sign-in", { replace: true });
  });
  const hasLocalToken = () => {
    try {
      return Boolean(localStorage.getItem("auth_token"));
    } catch {
      return false;
    }
  };

  const forceSignIn = (message: string) => {
    try {
      localStorage.removeItem("auth_token");
    } catch {}
    try {
      sessionStorage.setItem("flash_toast", JSON.stringify({ kind: "error", message }));
    } catch {}
    navigate("/sign-in", { replace: true });
  };

  createEffect(() => {
    if (readOnly()) return;
    if (!auth.loading()) return;
    const timer = globalThis.setTimeout(() => {
      if (!auth.loading()) return;
      forceSignIn("Session restore timed out. Please sign in again.");
    }, 15_000);
    return () => globalThis.clearTimeout(timer);
  });
  createEffect(() => {
    try {
      document.title = readOnly() ? "CUAN YUK!" : "Dashboard";
    } catch {}
  });

  const showToast = (kind: ToastKind, message: string) => toast.showToast(kind, message);

  const isAction = (kind: NonNullable<ReturnType<typeof action>>["kind"], id?: string) => {
    const a = action();
    if (!a) return false;
    if (a.kind !== kind) return false;
    if (id && a.id !== id) return false;
    return true;
  };

  const formatIdr = (n: number) => {
    try {
      return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      }).format(n);
    } catch {
      return `Rp ${n}`;
    }
  };

  createEffect(() => {
    const id = globalThis.setInterval(() => setNowMs(Date.now()), 1000);
    return () => globalThis.clearInterval(id);
  });

  const formatCountdown = (expiresAt: string | null) => {
    if (!expiresAt) return "No expiry";
    const ms = new Date(expiresAt).getTime() - nowMs();
    if (!Number.isFinite(ms)) return "No expiry";
    if (ms <= 0) return "Expired";
    const sec = Math.floor(ms / 1000);
    const days = Math.floor(sec / 86400);
    const hours = Math.floor((sec % 86400) / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m ${s}s`;
    if (mins > 0) return `${mins}m ${s}s`;
    return `${s}s`;
  };

  const defaultMerchantImage = (name: string) => {
    const initial = (name.trim()[0] ?? "M").toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7ccf"/><stop offset="0.5" stop-color="#9d7cff"/><stop offset="1" stop-color="#7cffd6"/></linearGradient></defs><rect width="128" height="128" rx="28" fill="url(#g)"/><circle cx="94" cy="34" r="26" fill="rgba(255,255,255,.18)"/><circle cx="28" cy="100" r="30" fill="rgba(0,0,0,.14)"/><text x="64" y="76" text-anchor="middle" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" font-size="54" font-weight="800" fill="rgba(10,12,20,.78)">${initial}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };

  const defaultQrisImage = (label: string) => {
    const initial = (label.trim()[0] ?? "Q").toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="840" viewBox="0 0 1200 840">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff7ccf" stop-opacity="0.22"/>
      <stop offset="0.5" stop-color="#9d7cff" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#7cffd6" stop-opacity="0.22"/>
    </linearGradient>
    <radialGradient id="r" cx="50%" cy="40%" r="80%">
      <stop offset="0" stop-color="rgba(255,255,255,0.14)"/>
      <stop offset="1" stop-color="rgba(0,0,0,0)"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="840" rx="44" fill="rgba(10,12,20,0.92)"/>
  <rect x="18" y="18" width="1164" height="804" rx="38" fill="url(#g)"/>
  <rect x="34" y="34" width="1132" height="772" rx="34" fill="rgba(16,20,34,0.78)"/>
  <rect x="34" y="34" width="1132" height="772" rx="34" fill="url(#r)" opacity="0.8"/>
  <g opacity="0.9">
    <rect x="120" y="140" width="380" height="380" rx="36" fill="rgba(0,0,0,0.18)" stroke="rgba(255,255,255,0.12)"/>
    <rect x="160" y="180" width="300" height="300" rx="30" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)"/>
    <text x="310" y="355" text-anchor="middle" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" font-size="120" font-weight="850" fill="rgba(250,250,255,0.18)">${initial}</text>
  </g>
  <text x="560" y="250" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" font-size="54" font-weight="850" fill="rgba(250,250,255,0.88)">QRIS image not available</text>
  <text x="560" y="320" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" font-size="28" font-weight="500" fill="rgba(250,250,255,0.62)">The previous upload is broken or missing.</text>
  <text x="560" y="390" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" font-size="28" font-weight="500" fill="rgba(250,250,255,0.62)">Please upload again or open the link.</text>
  <g opacity="0.85">
    <rect x="560" y="450" width="520" height="88" rx="22" fill="rgba(0,0,0,0.22)" stroke="rgba(255,255,255,0.14)"/>
    <text x="820" y="508" text-anchor="middle" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" font-size="28" font-weight="700" fill="rgba(250,250,255,0.82)">Open</text>
  </g>
</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };

  const fileToBase64 = async (file: File, onProgress?: (progress: number) => void) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("READ_FAILED"));
      reader.onprogress = (e) => {
        if (!e.lengthComputable) return;
        const p = Math.round((e.loaded / e.total) * 100);
        onProgress?.(p);
      };
      reader.onload = () => {
        const raw = String(reader.result ?? "");
        const i = raw.indexOf("base64,");
        if (i < 0) return reject(new Error("READ_FAILED"));
        resolve(raw.slice(i + "base64,".length));
      };
      reader.readAsDataURL(file);
    });

  const openUrl = (id: string, url: string) => {
    setOpenItemId(id);
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {}
    globalThis.setTimeout(() => {
      if (openItemId() === id) setOpenItemId(null);
    }, 700);
  };

  const itemsByMerchant = createMemo(() => {
    const map = new Map<string, PaymentItem[]>();
    for (const it of items()) {
      const arr = map.get(it.merchant.id) ?? [];
      arr.push(it);
      map.set(it.merchant.id, arr);
    }
    return map;
  });

  const summaryByMerchant = createMemo(() => {
    const map = new Map<string, { links: number; qris: number; active: number }>();
    for (const it of items()) {
      const cur = map.get(it.merchant.id) ?? { links: 0, qris: 0, active: 0 };
      if (it.kind === "LINK") cur.links += 1;
      if (it.kind === "QRIS") cur.qris += 1;
      if (it.status === "ACTIVE") cur.active += 1;
      map.set(it.merchant.id, cur);
    }
    return map;
  });

  const refreshCore = async () => {
    try {
      if (publicToken) {
        const res = await api.get<{ ok: boolean; merchants?: Merchant[]; items?: PaymentItem[] }>(
          `/public/dashboard/${encodeURIComponent(publicToken)}`,
        );
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        setNotFound(false);
        setMerchants(res.merchants ?? []);
        setItems((res.items ?? []).filter((i) => i.status === "ACTIVE"));
        return;
      }

      type Unauthorized = { ok: false; code: "UNAUTHORIZED" };
      const isUnauthorized = (v: unknown): v is Unauthorized =>
        Boolean(v) &&
        typeof v === "object" &&
        (v as { ok?: unknown }).ok === false &&
        (v as { code?: unknown }).code === "UNAUTHORIZED";

      const [mRaw, pRaw, cRaw] = await Promise.all([
        api.get<unknown>("/merchants/"),
        api.get<unknown>("/payments/active"),
        api.get<unknown>("/categories/"),
      ]);

      if (isUnauthorized(mRaw) || isUnauthorized(pRaw) || isUnauthorized(cRaw)) {
        forceSignIn("Session expired. Please sign in again.");
        return;
      }

      const m = mRaw as { merchants?: Merchant[] };
      const p = pRaw as { items?: PaymentItem[] };
      const c = cRaw as { categories?: { id: string | null; name: string }[] };

      const nextMerchants = Array.isArray(m.merchants) ? m.merchants : [];
      const nextItems = Array.isArray(p.items) ? p.items : [];
      const nextCategories = Array.isArray(c.categories) ? c.categories : [];

      setMerchants(nextMerchants);
      setItems(nextItems.filter((i) => i.status === "ACTIVE"));
      setCategoriesList(nextCategories);
      if (!postMerchantId() && nextMerchants.length) setPostMerchantId(nextMerchants[0].id);
      if (!newMerchantCategory() && nextCategories.length)
        setNewMerchantCategory(nextCategories[0].name);
    } catch (e) {
      if (publicToken) {
        setNotFound(true);
        return;
      }
      if (hasLocalToken()) {
        forceSignIn("Session restore failed. Please sign in again.");
        return;
      }
      showToast("error", e instanceof Error ? e.message : "SYNC_FAILED");
    }
  };

  const refresh = async (opts: { showSpinner: boolean; showSkeleton: boolean }) => {
    if (refreshInFlight) return;
    if (opts.showSkeleton) setLoading(true);
    if (opts.showSpinner) setSyncing(true);
    const guardId =
      opts.showSpinner || opts.showSkeleton
        ? globalThis.setTimeout(() => {
            if (!refreshInFlight) return;
            setSyncing(false);
            setLoading(false);
          }, 12_000)
        : null;
    refreshInFlight = (async () => {
      await refreshCore();
    })();
    try {
      await refreshInFlight;
    } finally {
      refreshInFlight = null;
      if (guardId) globalThis.clearTimeout(guardId);
      if (opts.showSkeleton) setLoading(false);
      if (opts.showSpinner) setSyncing(false);
    }
  };

  createEffect(() => {
    if (!readOnly() && (auth.loading() || !auth.me())) return;
    void refresh({ showSpinner: true, showSkeleton: true });
    const wsUrl = `${wsBase.replace(/\/$/, "")}/ws`;
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      ws = null;
    }
    let pingTimer: ReturnType<typeof globalThis.setInterval> | null = null;
    let pollTimer: ReturnType<typeof globalThis.setInterval> | null = null;
    let lastSoftSyncAt = 0;
    if (ws) {
      ws.addEventListener("message", (ev) => {
        try {
          const msg = JSON.parse(String(ev.data));
          if (msg?.type === "items:changed") {
            const now = Date.now();
            if (now - lastSoftSyncAt < 10_000) return;
            lastSoftSyncAt = now;
            void refresh({ showSpinner: true, showSkeleton: false });
          }
        } catch {}
      });
      ws.addEventListener("open", () => {
        pingTimer = globalThis.setInterval(() => {
          try {
            ws?.send(JSON.stringify({ type: "ping" }));
          } catch {}
        }, 10000);
      });
      ws.addEventListener("close", () => {
        if (pingTimer) globalThis.clearInterval(pingTimer);
        pingTimer = null;
      });
    }
    pollTimer = globalThis.setInterval(() => {
      if (action()) return;
      const now = Date.now();
      if (now - lastSoftSyncAt < 10_000) return;
      lastSoftSyncAt = now;
      void refresh({ showSpinner: true, showSkeleton: false });
    }, 10000);
    return () => {
      if (pingTimer) globalThis.clearInterval(pingTimer);
      pingTimer = null;
      if (pollTimer) globalThis.clearInterval(pollTimer);
      pollTimer = null;
      try {
        ws?.close();
      } catch {}
    };
  });

  createEffect(() => {
    if (readOnly()) return;
    if (adminChecked()) return;
    if (!hasLocalToken()) return;
    setAdminChecked(true);
    setAdminAccessLoading(true);
    void api
      .get<unknown>("/admin/access")
      .then((res) => {
        const ok = Boolean(res && typeof res === "object" && (res as { ok?: unknown }).ok === true);
        setHasAdminAccess(ok);
      })
      .catch(() => setHasAdminAccess(false))
      .finally(() => setAdminAccessLoading(false));
  });

  const categories = createMemo(() => groupByCategory(merchants()));
  const hasAnyCategories = createMemo(() => categoriesList().length > 0);
  const hasAnyMerchants = createMemo(() => merchants().length > 0);
  const isCategoryNameValid = createMemo(() => newCategoryName().trim().length >= 2);
  const categoryNameError = createMemo(() =>
    touchedCategoryName() && !isCategoryNameValid() ? "Please fill in this field." : null,
  );

  const isMerchantNameValid = createMemo(() => newMerchantName().trim().length >= 2);
  const isMerchantCategoryValid = createMemo(
    () => newMerchantCategory().trim().length > 0 && categoriesList().length > 0,
  );
  const merchantNameError = createMemo(() =>
    touchedMerchantName() && !isMerchantNameValid() ? "Please fill in this field." : null,
  );
  const merchantCategoryError = createMemo(() =>
    touchedMerchantCategory() && !isMerchantCategoryValid()
      ? categoriesList().length === 0
        ? "Please create a category first."
        : "Please choose a value."
      : null,
  );

  const paymentAmountRaw = createMemo(() => postTotalAmount().replace(/[^\d]/g, ""));
  const paymentAmount = createMemo(() => {
    const amountRaw = paymentAmountRaw();
    return amountRaw ? Number(amountRaw) : Number.NaN;
  });
  const isPaymentAmountValid = createMemo(
    () => Number.isFinite(paymentAmount()) && paymentAmount() > 0,
  );
  const isPaymentMerchantValid = createMemo(() => postMerchantId().trim().length > 0);
  const isPaymentLinkValid = createMemo(() =>
    postKind() === "LINK" ? postLink().trim().length >= 8 : true,
  );
  const isPaymentQrisValid = createMemo(() =>
    postKind() === "QRIS" ? Boolean(postQrisFile()) : true,
  );
  const canSubmitPayment = createMemo(
    () =>
      !readOnly() &&
      !action() &&
      isPaymentMerchantValid() &&
      isPaymentAmountValid() &&
      isPaymentLinkValid() &&
      isPaymentQrisValid(),
  );
  const paymentMerchantError = createMemo(() =>
    touchedPaymentMerchant() && !isPaymentMerchantValid() ? "Please choose a value." : null,
  );
  const paymentAmountError = createMemo(() =>
    touchedPaymentAmount() && paymentAmountRaw().length === 0 ? "Please fill in this field." : null,
  );
  const paymentLinkError = createMemo(() =>
    touchedPaymentLink() && postKind() === "LINK" && postLink().trim().length === 0
      ? "Please fill in this field."
      : null,
  );
  const paymentQrisError = createMemo(() =>
    touchedPaymentQris() && postKind() === "QRIS" && !isPaymentQrisValid()
      ? "Please upload an image."
      : null,
  );
  const categoryPageSize = 10;
  const [categoryPage, setCategoryPage] = createSignal(1);
  const categoryTotalPages = createMemo(() =>
    Math.max(1, Math.ceil(categories().length / categoryPageSize)),
  );
  createEffect(() => {
    const p = categoryPage();
    const tp = categoryTotalPages();
    if (p > tp) setCategoryPage(tp);
    if (p < 1) setCategoryPage(1);
  });
  const categoriesPaged = createMemo(() => {
    const start = (categoryPage() - 1) * categoryPageSize;
    return categories().slice(start, start + categoryPageSize);
  });
  const [visibleMerchantsByCategory, setVisibleMerchantsByCategory] = createSignal<
    Map<string, number>
  >(new Map());
  const visibleMerchantsCount = (categoryName: string) =>
    visibleMerchantsByCategory().get(categoryName) ?? 10;
  const loadMoreMerchants = (categoryName: string) => {
    setVisibleMerchantsByCategory((prev) => {
      const next = new Map(prev);
      next.set(categoryName, visibleMerchantsCount(categoryName) + 10);
      return next;
    });
  };

  const addMerchant = async () => {
    if (readOnly()) return;
    if (!newMerchantCategory().trim()) {
      showToast("error", "Create a category first.");
      return;
    }
    setAction({ kind: "add_merchant" });
    showToast("progress", "Adding merchant…");
    try {
      const file = newMerchantFile();
      setMerchantUploadProgress(file ? 0 : null);
      const imageBase64 = file
        ? await fileToBase64(file, (p) => setMerchantUploadProgress(Math.round(p * 0.7)))
        : undefined;
      if (file) setMerchantUploadProgress(85);
      await api.post("/merchants/", {
        name: newMerchantName(),
        category: newMerchantCategory(),
        imageBase64,
      });
      if (file) setMerchantUploadProgress(100);
      setNewMerchantName("");
      setNewMerchantFile(null);
      showToast("success", "Merchant added.");
      await refresh({ showSpinner: true, showSkeleton: false });
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "ADD_MERCHANT_FAILED");
    } finally {
      globalThis.setTimeout(() => setMerchantUploadProgress(null), 650);
      setAction(null);
    }
  };

  const addCategory = async () => {
    if (readOnly()) return;
    const name = newCategoryName().trim();
    if (name.length < 2) return;
    setAction({ kind: "add_category" });
    showToast("progress", "Adding category…");
    try {
      await api.post("/categories/", { name });
      setNewCategoryName("");
      showToast("success", "Category added.");
      await refresh({ showSpinner: true, showSkeleton: false });
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "ADD_CATEGORY_FAILED");
    } finally {
      setAction(null);
    }
  };

  const post = async () => {
    if (readOnly()) return;
    if (merchants().length === 0) {
      showToast("error", "Add a merchant first.");
      return;
    }
    const amount = paymentAmount();
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast("error", "Total amount is required.");
      return;
    }
    setAction({ kind: "post" });
    showToast("progress", postKind() === "LINK" ? "Posting payment link…" : "Posting QRIS…");
    try {
      if (postKind() === "LINK") {
        await api.post("/payments/link", {
          merchantId: postMerchantId(),
          paymentUrl: postLink(),
          totalAmount: amount,
          expiration: postExpiration().trim() === "" ? undefined : postExpiration().trim(),
        });
        setPostLink("");
        setPostExpiration("");
        setPostTotalAmount("");
        showToast("success", "Payment link posted.");
      } else {
        const f = postQrisFile();
        if (!f) throw new Error("Missing QRIS image.");
        setQrisUploadProgress(0);
        const imageBase64 = await fileToBase64(f, (p) =>
          setQrisUploadProgress(Math.round(p * 0.7)),
        );
        setQrisUploadProgress(85);
        await api.post("/payments/qris", {
          merchantId: postMerchantId(),
          imageBase64,
          totalAmount: amount,
          expiration: postExpiration().trim() === "" ? undefined : postExpiration().trim(),
        });
        setQrisUploadProgress(100);
        setPostQrisFile(null);
        setPostExpiration("");
        setPostTotalAmount("");
        showToast("success", "QRIS posted.");
      }
      await refresh({ showSpinner: true, showSkeleton: false });
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "POST_FAILED");
    } finally {
      globalThis.setTimeout(() => setQrisUploadProgress(null), 650);
      setAction(null);
    }
  };

  const deactivate = async (id: string) => {
    if (readOnly()) return;
    setAction({ kind: "deactivate", id });
    showToast("progress", "Taking down…");
    try {
      await api.postNoJson(`/payments/deactivate/${id}`, null);
      await refresh({ showSpinner: true, showSkeleton: false });
      showToast("success", "Taken down.");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "DEACTIVATE_FAILED");
    } finally {
      setAction(null);
    }
  };

  const signOut = async () => {
    if (readOnly()) return;
    setAction({ kind: "signout" });
    showToast("progress", "Signing out…");
    try {
      await auth.signOut();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "SIGNOUT_FAILED");
      setAction(null);
    }
  };

  const shareUrl = createMemo(() => auth.shareUrl());
  const isSuper = createMemo(() => auth.me()?.role === "SUPER");
  const totalLinks = createMemo(() => items().filter((i) => i.kind === "LINK").length);
  const totalQris = createMemo(() => items().filter((i) => i.kind === "QRIS").length);
  const [layoutMode, setLayoutMode] = createSignal<"CATEGORY" | "MERCHANT" | "LINK" | "QRIS">(
    "CATEGORY",
  );

  const merchantLayoutPageSize = 20;
  const [merchantLayoutPage, setMerchantLayoutPage] = createSignal(1);
  const merchantsSorted = createMemo(() =>
    merchants()
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  const merchantLayoutTotalPages = createMemo(() =>
    Math.max(1, Math.ceil(merchantsSorted().length / merchantLayoutPageSize)),
  );
  createEffect(() => {
    const p = merchantLayoutPage();
    const tp = merchantLayoutTotalPages();
    if (p > tp) setMerchantLayoutPage(tp);
    if (p < 1) setMerchantLayoutPage(1);
  });
  const merchantsPagedForLayout = createMemo(() => {
    const start = (merchantLayoutPage() - 1) * merchantLayoutPageSize;
    return merchantsSorted().slice(start, start + merchantLayoutPageSize);
  });

  const itemLayoutPageSize = 20;
  const [itemLayoutPage, setItemLayoutPage] = createSignal(1);
  const itemsSorted = createMemo(() =>
    items()
      .slice()
      .sort((a, b) => (b.createdDate ?? "").localeCompare(a.createdDate ?? "")),
  );
  const itemsByLayout = createMemo(() => {
    const mode = layoutMode();
    if (mode === "LINK") return itemsSorted().filter((i) => i.kind === "LINK");
    if (mode === "QRIS") return itemsSorted().filter((i) => i.kind === "QRIS");
    return [];
  });
  const itemLayoutTotalPages = createMemo(() =>
    Math.max(1, Math.ceil(itemsByLayout().length / itemLayoutPageSize)),
  );
  createEffect(() => {
    const p = itemLayoutPage();
    const tp = itemLayoutTotalPages();
    if (p > tp) setItemLayoutPage(tp);
    if (p < 1) setItemLayoutPage(1);
  });
  const itemsPagedForLayout = createMemo(() => {
    const start = (itemLayoutPage() - 1) * itemLayoutPageSize;
    return itemsByLayout().slice(start, start + itemLayoutPageSize);
  });

  createEffect(() => {
    const mode = layoutMode();
    setSelectedMerchant(null);
    setCategoryPage(1);
    setMerchantLayoutPage(1);
    setItemLayoutPage(1);
    if (mode === "LINK") setTab("LINK");
    if (mode === "QRIS") setTab("QRIS");
  });

  const selectedItems = createMemo(() => {
    const m = selectedMerchant();
    if (!m) return [];
    return (itemsByMerchant().get(m.id) ?? []).filter((i) => i.kind === tab());
  });

  if (readOnly() && notFound())
    return (
      <div class="shell">
        <div class="panel">
          <div class="panelInner">
            <div class="notFoundWrap">
              <div class="notFoundLogo">
                <div class="notFoundMark">CY</div>
              </div>
              <div class="notFoundTitle">404 • Not Found</div>
              <div class="notFoundText">
                This link doesn’t exist anymore (or it’s not available from your network). Ask the
                owner to generate a new one.
              </div>
              <a
                class="btn btnHero"
                href="/"
                style="width: min(320px, 100%); display: inline-flex; justify-content: center"
              >
                Go Home
              </a>
            </div>
          </div>
        </div>
      </div>
    );

  if (!readOnly() && auth.loading() && !hasLocalToken())
    return (
      <div class="shell">
        <div class="panel">
          <div class="panelInner">
            <div style="display: grid; place-items: center; padding: 30px 12px; gap: 10px">
              <span class="spinner" />
              <div style="color: rgba(250,250,255,0.72)">Loading…</div>
            </div>
          </div>
        </div>
      </div>
    );

  if (!readOnly() && (auth.loading() || !auth.me()))
    return (
      <div class="shell">
        <div class="panel">
          <div class="panelInner">
            <div style="display: grid; place-items: center; padding: 30px 12px; gap: 10px">
              <span class="spinner" />
              <div style="color: rgba(250,250,255,0.72)">Loading…</div>
            </div>
          </div>
        </div>
      </div>
    );

  return (
    <div class="shell" style="place-items: start center">
      <Show when={dashLoadingOverlay()}>
        <div class="pageOverlay">
          <div style="display: grid; place-items: center; padding: 30px 12px; gap: 10px">
            <span class="spinner" />
            <div style="color: rgba(250,250,255,0.72)">Loading…</div>
          </div>
        </div>
      </Show>
      <div class="panel">
        <div class="panelInner">
          <div style="display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap">
            <div class="title" style="margin: 0">
              <h1>{readOnly() ? "CUAN YUK!" : "Dashboard"}</h1>
            </div>
            <div class="actionBar" style="flex-wrap: wrap">
              <button
                class="btn"
                type="button"
                onClick={() => void refresh({ showSpinner: true, showSkeleton: false })}
                disabled={syncing() || Boolean(action())}
              >
                <span style="display: inline-flex; gap: 10px; align-items: center; justify-content: center; width: 100%">
                  {syncing() ? <span class="spinner" /> : null}
                  {!syncing() ? (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <title>Refresh</title>
                      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                      <path d="M21 3v6h-6" />
                    </svg>
                  ) : null}
                  <span>{syncing() ? "Refreshing…" : "Refresh"}</span>
                </span>
              </button>
              <Show when={!readOnly()}>
                <Show
                  when={!adminAccessLoading()}
                  fallback={<div class="skeleton" style="height: 40px; border-radius: 14px" />}
                >
                  <Show when={hasAdminAccess()}>
                    <button
                      class="btn"
                      type="button"
                      onClick={() => {
                        globalThis.location.href = "/admin";
                      }}
                    >
                      <span style="display: inline-flex; gap: 10px; align-items: center; justify-content: center; width: 100%; font: inherit">
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                        >
                          <title>Admin</title>
                          <path d="M12 1l9 4v6c0 5-3.8 9.8-9 12-5.2-2.2-9-7-9-12V5l9-4z" />
                          <path d="M9 12l2 2 4-4" />
                        </svg>
                        <span>Admin</span>
                      </span>
                    </button>
                  </Show>
                </Show>

                <button
                  class="btn"
                  type="button"
                  disabled={isAction("signout")}
                  onClick={() => void signOut()}
                >
                  <span style="display: inline-flex; gap: 10px; align-items: center; justify-content: center; width: 100%">
                    {isAction("signout") ? <span class="spinner" /> : null}
                    {!isAction("signout") ? (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <title>Log out</title>
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <path d="M16 17l5-5-5-5" />
                        <path d="M21 12H9" />
                      </svg>
                    ) : null}
                    <span>{isAction("signout") ? "Signing Out…" : "Log Out"}</span>
                  </span>
                </button>

                <div style="display: flex; justify-content: flex-end; margin-left: 4px">
                  <NotificationBell />
                </div>
              </Show>
            </div>
          </div>

          <div class="grid" style="margin-top: 18px">
            <div class="card" style="grid-column: span 8">
              <div class="cardInner">
                <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap">
                  <h2 class="sectionH2">Totals:</h2>
                  <div class="statPills">
                    <span class="statPill">
                      Merchants: <b>{merchants().length}</b>
                    </span>
                    <span class="statPill">
                      Payment Links: <b>{totalLinks()}</b>
                    </span>
                    <span class="statPill">
                      QRIS: <b>{totalQris()}</b>
                    </span>
                  </div>
                </div>

                <div style="display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: center; margin-top: 12px">
                  <h2 class="sectionH2">Filter by:</h2>
                  <div class="segmented">
                    <button
                      classList={{ segBtn: true, segBtnActive: layoutMode() === "CATEGORY" }}
                      type="button"
                      onClick={() => setLayoutMode("CATEGORY")}
                    >
                      Category
                    </button>
                    <button
                      classList={{ segBtn: true, segBtnActive: layoutMode() === "MERCHANT" }}
                      type="button"
                      onClick={() => setLayoutMode("MERCHANT")}
                    >
                      Merchant
                    </button>
                    <button
                      classList={{ segBtn: true, segBtnActive: layoutMode() === "LINK" }}
                      type="button"
                      onClick={() => setLayoutMode("LINK")}
                    >
                      Payment Link
                    </button>
                    <button
                      classList={{ segBtn: true, segBtnActive: layoutMode() === "QRIS" }}
                      type="button"
                      onClick={() => setLayoutMode("QRIS")}
                    >
                      QRIS
                    </button>
                  </div>
                </div>

                <Show when={!readOnly() && shareUrl()}>
                  <div style="margin-top: 12px; display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap">
                    <h2 class="sectionH2">Share:</h2>
                    <div class="segmented" style="margin-left: auto">
                      <button
                        class="segBtn"
                        type="button"
                        onClick={() => {
                          const url = shareUrl();
                          if (!url) return;
                          openUrl("share-open", url);
                        }}
                      >
                        <span style="display: inline-flex; gap: 10px; align-items: center">
                          {openItemId() === "share-open" ? <span class="spinner" /> : null}
                          <span>Open</span>
                        </span>
                      </button>
                      <button
                        class="segBtn"
                        type="button"
                        onClick={async () => {
                          try {
                            const url = shareUrl();
                            if (!url) return;
                            await navigator.clipboard.writeText(url);
                            showToast("success", "Link copied.");
                          } catch {
                            showToast("error", "COPY_FAILED");
                          }
                        }}
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </Show>

                <Show
                  when={!loading() || merchants().length > 0}
                  fallback={
                    <div
                      style={{
                        display: "grid",
                        "grid-template-columns": "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: "12px",
                        "margin-top": "14px",
                      }}
                    >
                      <For each={[1, 2, 3, 4, 5, 6, 7, 8, 9]}>
                        {() => (
                          <div class="card" style="padding: 0">
                            <div class="cardInner" style="display: grid; gap: 10px">
                              <div style="display: flex; gap: 10px; align-items: center">
                                <div
                                  class="skeleton"
                                  style="width: 38px; height: 38px; border-radius: 14px"
                                />
                                <div style="flex: 1; min-width: 0; display: grid; gap: 8px">
                                  <div
                                    class="skeleton"
                                    style="height: 14px; width: 62%; border-radius: 10px"
                                  />
                                  <div
                                    class="skeleton"
                                    style="height: 12px; width: 42%; border-radius: 10px"
                                  />
                                </div>
                              </div>
                              <div
                                class="skeleton"
                                style="height: 12px; width: 54%; border-radius: 10px"
                              />
                            </div>
                          </div>
                        )}
                      </For>
                    </div>
                  }
                >
                  <div style="display: grid; gap: 14px; margin-top: 14px">
                    <Show when={layoutMode() === "CATEGORY"}>
                      <For each={categoriesPaged()}>
                        {(cat) => (
                          <div>
                            <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px">
                              <div style="font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(250,250,255,0.62)">
                                {cat.category}
                              </div>
                            </div>
                            <div
                              style={{
                                display: "grid",
                                "grid-template-columns": "repeat(auto-fit, minmax(220px, 1fr))",
                                gap: "12px",
                                "margin-top": "10px",
                              }}
                            >
                              <For
                                each={cat.merchants.slice(
                                  0,
                                  Math.max(0, visibleMerchantsCount(cat.category)),
                                )}
                              >
                                {(m) => {
                                  const sum = () =>
                                    summaryByMerchant().get(m.id) ?? {
                                      links: 0,
                                      qris: 0,
                                      active: 0,
                                    };
                                  return (
                                    <button
                                      class="card"
                                      type="button"
                                      style={{
                                        cursor: "pointer",
                                        padding: "0",
                                        "text-align": "left",
                                      }}
                                      onClick={() => {
                                        setSelectedMerchant(m);
                                        setTab("LINK");
                                      }}
                                    >
                                      <div class="cardInner" style="display: grid; gap: 10px">
                                        <div style="display: flex; gap: 12px; align-items: center; justify-content: space-between">
                                          <div style="display: inline-flex; gap: 10px; align-items: center; min-width: 0">
                                            <img
                                              src={m.pictureUrl ?? defaultMerchantImage(m.name)}
                                              alt=""
                                              style="width: 38px; height: 38px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.14); object-fit: cover; flex: 0 0 auto"
                                              onError={(e) => {
                                                const img = e.currentTarget;
                                                if (img.dataset.fallback === "1") return;
                                                img.dataset.fallback = "1";
                                                img.src = defaultMerchantImage(m.name);
                                              }}
                                            />
                                            <div style="font-weight: 700; letter-spacing: -0.01em; color: rgba(250,250,255,0.92); overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
                                              {m.name}
                                            </div>
                                          </div>
                                        </div>
                                        <div style="font-size: 13px; color: rgba(250,250,255,0.78); line-height: 1.4">
                                          <span class="countRow">
                                            <span class="countPill">
                                              <span class="countPillLabel">Links</span>
                                              <span class="countPillValue">{sum().links}</span>
                                            </span>
                                            <span class="countDot">•</span>
                                            <span class="countPill">
                                              <span class="countPillLabel">QRIS</span>
                                              <span class="countPillValue">{sum().qris}</span>
                                            </span>
                                          </span>
                                        </div>
                                      </div>
                                    </button>
                                  );
                                }}
                              </For>
                            </div>
                            <Show when={cat.merchants.length > visibleMerchantsCount(cat.category)}>
                              <div style="margin-top: 10px">
                                <button
                                  class="btn"
                                  type="button"
                                  style="width: 100%"
                                  onClick={() => loadMoreMerchants(cat.category)}
                                >
                                  Load more
                                </button>
                              </div>
                            </Show>
                          </div>
                        )}
                      </For>

                      <Show when={categoryTotalPages() > 1}>
                        <div style="display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap">
                          <button
                            class="btn"
                            type="button"
                            disabled={categoryPage() <= 1}
                            onClick={() => setCategoryPage((p) => Math.max(1, p - 1))}
                          >
                            Prev
                          </button>
                          <button
                            class="btn"
                            type="button"
                            disabled={categoryPage() >= categoryTotalPages()}
                            onClick={() =>
                              setCategoryPage((p) => Math.min(categoryTotalPages(), p + 1))
                            }
                          >
                            Next
                          </button>
                        </div>
                      </Show>
                    </Show>

                    <Show when={layoutMode() === "MERCHANT"}>
                      <div
                        style={{
                          display: "grid",
                          "grid-template-columns": "repeat(auto-fit, minmax(220px, 1fr))",
                          gap: "12px",
                        }}
                      >
                        <For each={merchantsPagedForLayout()}>
                          {(m) => {
                            const sum = () =>
                              summaryByMerchant().get(m.id) ?? { links: 0, qris: 0, active: 0 };
                            return (
                              <button
                                class="card"
                                type="button"
                                style={{ cursor: "pointer", padding: "0", "text-align": "left" }}
                                onClick={() => {
                                  setSelectedMerchant(m);
                                  setTab("LINK");
                                }}
                              >
                                <div class="cardInner" style="display: grid; gap: 10px">
                                  <div style="display: flex; gap: 12px; align-items: center; justify-content: space-between">
                                    <div style="display: inline-flex; gap: 10px; align-items: center; min-width: 0">
                                      <img
                                        src={m.pictureUrl ?? defaultMerchantImage(m.name)}
                                        alt=""
                                        style="width: 38px; height: 38px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.14); object-fit: cover; flex: 0 0 auto"
                                        onError={(e) => {
                                          const img = e.currentTarget;
                                          if (img.dataset.fallback === "1") return;
                                          img.dataset.fallback = "1";
                                          img.src = defaultMerchantImage(m.name);
                                        }}
                                      />
                                      <div style="font-weight: 700; letter-spacing: -0.01em; color: rgba(250,250,255,0.92); overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
                                        {m.name}
                                      </div>
                                    </div>
                                  </div>
                                  <div style="font-size: 13px; color: rgba(250,250,255,0.78); line-height: 1.4">
                                    <span class="countRow">
                                      <span class="countPill">
                                        <span class="countPillLabel">Links</span>
                                        <span class="countPillValue">{sum().links}</span>
                                      </span>
                                      <span class="countDot">•</span>
                                      <span class="countPill">
                                        <span class="countPillLabel">QRIS</span>
                                        <span class="countPillValue">{sum().qris}</span>
                                      </span>
                                    </span>
                                  </div>
                                </div>
                              </button>
                            );
                          }}
                        </For>
                      </div>

                      <Show when={merchantLayoutTotalPages() > 1}>
                        <div style="display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap">
                          <button
                            class="btn"
                            type="button"
                            disabled={merchantLayoutPage() <= 1}
                            onClick={() => setMerchantLayoutPage((p) => Math.max(1, p - 1))}
                          >
                            Prev
                          </button>
                          <button
                            class="btn"
                            type="button"
                            disabled={merchantLayoutPage() >= merchantLayoutTotalPages()}
                            onClick={() =>
                              setMerchantLayoutPage((p) =>
                                Math.min(merchantLayoutTotalPages(), p + 1),
                              )
                            }
                          >
                            Next
                          </button>
                        </div>
                      </Show>
                    </Show>

                    <Show when={layoutMode() === "LINK" || layoutMode() === "QRIS"}>
                      <Show
                        when={itemsByLayout().length > 0}
                        fallback={
                          <div class="emptyCenter">
                            <div class="emptyLogo">CY</div>
                            <div class="emptyTitle">No payments yet</div>
                            <div class="emptyText">
                              Drop a payment link or QRIS and it’ll show up here.
                            </div>
                          </div>
                        }
                      >
                        <div
                          style={{
                            display: "grid",
                            gap: "12px",
                            "grid-template-columns":
                              layoutMode() === "QRIS"
                                ? "repeat(auto-fit, minmax(260px, 1fr))"
                                : "repeat(auto-fit, minmax(220px, 1fr))",
                          }}
                        >
                          <For each={itemsPagedForLayout()}>
                            {(it) => (
                              <div style="border: 1px solid rgba(255,255,255,0.12); border-radius: 18px; padding: 12px; display: grid; gap: 10px">
                                <div style="display: flex; gap: 10px; align-items: baseline; justify-content: space-between; flex-wrap: wrap">
                                  <div style="color: rgba(250,250,255,0.86); font-size: 16px; font-weight: 750; letter-spacing: -0.02em">
                                    {formatIdr(it.totalAmount)}
                                  </div>
                                  <div style="color: rgba(250,250,255,0.62); font-size: 13px">
                                    {formatCountdown(it.expiresAt)}
                                  </div>
                                </div>
                                <div style="color: rgba(250,250,255,0.68); font-size: 13px; line-height: 1.4">
                                  {it.merchant?.name ?? "—"}
                                </div>
                                <Show when={it.kind === "LINK" && it.paymentUrl}>
                                  <button
                                    class="btn btnWide"
                                    type="button"
                                    disabled={Boolean(action())}
                                    onClick={() => {
                                      const url = it.paymentUrl;
                                      if (!url) return;
                                      openUrl(`${it.id}:link`, url);
                                    }}
                                  >
                                    <span style="display: inline-flex; gap: 10px; align-items: center">
                                      {openItemId() === `${it.id}:link` ? (
                                        <span class="spinner" />
                                      ) : null}
                                      <span>Open</span>
                                    </span>
                                  </button>
                                </Show>
                                <Show when={it.kind === "QRIS" && it.qrisUrl}>
                                  <img
                                    src={it.qrisUrl ?? defaultQrisImage(it.merchant?.name ?? "")}
                                    alt="QRIS"
                                    style="width: 100%; max-height: 420px; object-fit: contain; border-radius: 16px; border: 1px solid rgba(255,255,255,0.12)"
                                    onError={(e) => {
                                      const img = e.currentTarget;
                                      if (img.dataset.fallback === "1") return;
                                      img.dataset.fallback = "1";
                                      img.src = defaultQrisImage(it.merchant?.name ?? "");
                                    }}
                                  />
                                  <button
                                    class="btn btnWide"
                                    type="button"
                                    disabled={Boolean(action())}
                                    onClick={() => {
                                      const url = it.qrisUrl;
                                      if (!url) return;
                                      openUrl(`${it.id}:qris`, url);
                                    }}
                                  >
                                    <span style="display: inline-flex; gap: 10px; align-items: center">
                                      {openItemId() === `${it.id}:qris` ? (
                                        <span class="spinner" />
                                      ) : null}
                                      <span>Open</span>
                                    </span>
                                  </button>
                                </Show>
                                <Show when={!readOnly() && it.status === "ACTIVE"}>
                                  <button
                                    class="btn btnWide"
                                    type="button"
                                    disabled={Boolean(action())}
                                    onClick={() => void deactivate(it.id)}
                                  >
                                    <span style="display: inline-flex; gap: 10px; align-items: center">
                                      {isAction("deactivate", it.id) ? (
                                        <span class="spinner" />
                                      ) : null}
                                      <span>
                                        {isAction("deactivate", it.id)
                                          ? "Taking Down…"
                                          : "Take Down"}
                                      </span>
                                    </span>
                                  </button>
                                </Show>
                              </div>
                            )}
                          </For>
                        </div>

                        <Show when={itemLayoutTotalPages() > 1}>
                          <div style="display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap">
                            <button
                              class="btn"
                              type="button"
                              disabled={itemLayoutPage() <= 1}
                              onClick={() => setItemLayoutPage((p) => Math.max(1, p - 1))}
                            >
                              Prev
                            </button>
                            <button
                              class="btn"
                              type="button"
                              disabled={itemLayoutPage() >= itemLayoutTotalPages()}
                              onClick={() =>
                                setItemLayoutPage((p) => Math.min(itemLayoutTotalPages(), p + 1))
                              }
                            >
                              Next
                            </button>
                          </div>
                        </Show>
                      </Show>
                    </Show>
                  </div>
                </Show>
              </div>
            </div>

            <Show when={!readOnly()}>
              <div style="grid-column: span 4; display: grid; gap: 16px">
                <div class="card">
                  <div class="cardInner" style="display: grid; gap: 12px">
                    <div style="font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(250,250,255,0.62)">
                      Add Category
                    </div>
                    <div class="field">
                      <label for="add_category_name">
                        Name<span class="fieldReq">*</span>
                      </label>
                      <input
                        id="add_category_name"
                        class={categoryNameError() ? "inputError" : undefined}
                        value={newCategoryName()}
                        onInput={(e) => setNewCategoryName(e.currentTarget.value)}
                        onBlur={() => setTouchedCategoryName(true)}
                        placeholder="e.g. Food"
                      />
                      <Show when={categoryNameError()}>
                        <div class="fieldError">{categoryNameError()}</div>
                      </Show>
                    </div>
                    <button
                      class="btn btnPrimary"
                      type="button"
                      disabled={!isCategoryNameValid() || Boolean(action())}
                      onClick={() => {
                        setTouchedCategoryName(true);
                        if (!isCategoryNameValid()) return;
                        void addCategory();
                      }}
                    >
                      <span style="display: inline-flex; gap: 10px; align-items: center">
                        {isAction("add_category") ? <span class="spinner" /> : null}
                        <span>{isAction("add_category") ? "Submitting…" : "Submit"}</span>
                      </span>
                    </button>
                  </div>
                </div>

                <Show when={hasAnyCategories()}>
                  <div class="card">
                    <div class="cardInner" style="display: grid; gap: 12px">
                      <div style="font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(250,250,255,0.62)">
                        Add Merchant
                      </div>
                      <div class="field">
                        <label for="add_merchant_name">
                          Name<span class="fieldReq">*</span>
                        </label>
                        <input
                          id="add_merchant_name"
                          class={merchantNameError() ? "inputError" : undefined}
                          value={newMerchantName()}
                          onInput={(e) => setNewMerchantName(e.currentTarget.value)}
                          onBlur={() => setTouchedMerchantName(true)}
                        />
                        <Show when={merchantNameError()}>
                          <div class="fieldError">{merchantNameError()}</div>
                        </Show>
                      </div>
                      <div class="field">
                        <label for="add_merchant_category">
                          Category<span class="fieldReq">*</span>
                        </label>
                        <Show
                          when={!loading() || categoriesList().length > 0}
                          fallback={<div class="skeleton selectSkeleton" />}
                        >
                          <select
                            id="add_merchant_category"
                            class="select"
                            style="width: 100%"
                            classList={{ inputError: Boolean(merchantCategoryError()) }}
                            value={newMerchantCategory()}
                            disabled={categoriesList().length === 0}
                            onChange={(e) => setNewMerchantCategory(e.currentTarget.value)}
                            onBlur={() => setTouchedMerchantCategory(true)}
                          >
                            <For each={categoriesList()}>
                              {(c) => <option value={c.name}>{c.name}</option>}
                            </For>
                          </select>
                        </Show>
                        <Show when={merchantCategoryError()}>
                          <div class="fieldError">{merchantCategoryError()}</div>
                        </Show>
                      </div>
                      <div class="field">
                        <ImageDropzone
                          id="merchant_picture"
                          label="Merchant icon"
                          file={newMerchantFile()}
                          setFile={(f) => {
                            setNewMerchantFile(f);
                            setMerchantUploadProgress(null);
                          }}
                          supportedExts={["png", "jpg", "jpeg", "gif", "webp"]}
                          progress={merchantUploadProgress()}
                          disabled={Boolean(action())}
                          invalidToast={(m) => showToast("error", m)}
                        />
                      </div>
                      <button
                        class="btn btnPrimary"
                        type="button"
                        disabled={
                          !isMerchantNameValid() || !isMerchantCategoryValid() || Boolean(action())
                        }
                        onClick={() => {
                          setTouchedMerchantName(true);
                          setTouchedMerchantCategory(true);
                          if (!isMerchantNameValid() || !isMerchantCategoryValid()) return;
                          void addMerchant();
                        }}
                      >
                        <span style="display: inline-flex; gap: 10px; align-items: center">
                          {isAction("add_merchant") ? <span class="spinner" /> : null}
                          <span>{isAction("add_merchant") ? "Submitting…" : "Submit"}</span>
                        </span>
                      </button>
                    </div>
                  </div>
                </Show>

                <Show when={hasAnyMerchants()}>
                  <div class="card">
                    <div class="cardInner" style="display: grid; gap: 12px">
                      <div style="font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(250,250,255,0.62)">
                        Add Payment Link/QRIS
                      </div>
                      <div style="display: flex; gap: 10px; flex-wrap: wrap">
                        <button
                          class={`btn ${postKind() === "LINK" ? "btnPrimary" : ""}`}
                          type="button"
                          onClick={() => setPostKind("LINK")}
                        >
                          Payment Link
                        </button>
                        <button
                          class={`btn ${postKind() === "QRIS" ? "btnPrimary" : ""}`}
                          type="button"
                          onClick={() => setPostKind("QRIS")}
                        >
                          QRIS
                        </button>
                      </div>
                      <div class="field">
                        <label for="add_payment_merchant">
                          Merchant<span class="fieldReq">*</span>
                        </label>
                        <Show
                          when={!loading() || merchants().length > 0}
                          fallback={<div class="skeleton selectSkeleton" />}
                        >
                          <select
                            id="add_payment_merchant"
                            class="select"
                            style="width: 100%"
                            classList={{ inputError: Boolean(paymentMerchantError()) }}
                            value={postMerchantId()}
                            onChange={(e) => setPostMerchantId(e.currentTarget.value)}
                            onBlur={() => setTouchedPaymentMerchant(true)}
                          >
                            <For each={merchants()}>
                              {(m) => <option value={m.id}>{m.name}</option>}
                            </For>
                          </select>
                        </Show>
                        <Show when={paymentMerchantError()}>
                          <div class="fieldError">{paymentMerchantError()}</div>
                        </Show>
                      </div>
                      <div class="field">
                        <label for="add_payment_expiration">Expiration Time (default: 12H)</label>
                        <input
                          id="add_payment_expiration"
                          placeholder="12h / 5m / 1h / 1d / lifetime"
                          value={postExpiration()}
                          onInput={(e) => setPostExpiration(e.currentTarget.value)}
                        />
                      </div>
                      <div class="field">
                        <label for="add_payment_amount">
                          Payment Amount<span class="fieldReq">*</span>
                        </label>
                        <input
                          id="add_payment_amount"
                          class={paymentAmountError() ? "inputError" : undefined}
                          inputmode="numeric"
                          value={postTotalAmount()}
                          onInput={(e) => setPostTotalAmount(e.currentTarget.value)}
                          onBlur={() => setTouchedPaymentAmount(true)}
                          placeholder="e.g. 150000"
                        />
                        <Show when={paymentAmountError()}>
                          <div class="fieldError">{paymentAmountError()}</div>
                        </Show>
                      </div>
                      <Show when={postKind() === "LINK"}>
                        <div class="field">
                          <label for="add_payment_link">
                            Payment Link<span class="fieldReq">*</span>
                          </label>
                          <input
                            id="add_payment_link"
                            class={paymentLinkError() ? "inputError" : undefined}
                            value={postLink()}
                            onInput={(e) => setPostLink(e.currentTarget.value)}
                            onBlur={() => setTouchedPaymentLink(true)}
                            placeholder="https://…"
                          />
                          <Show when={paymentLinkError()}>
                            <div class="fieldError">{paymentLinkError()}</div>
                          </Show>
                        </div>
                      </Show>
                      <Show when={postKind() === "QRIS"}>
                        <div class="field">
                          <ImageDropzone
                            id="add_payment_qris"
                            label="QRIS image"
                            required
                            file={postQrisFile()}
                            setFile={(f) => {
                              setPostQrisFile(f);
                              setQrisUploadProgress(null);
                            }}
                            supportedExts={["png", "jpg", "jpeg", "gif", "webp"]}
                            progress={qrisUploadProgress()}
                            disabled={Boolean(action())}
                            invalidToast={(m) => showToast("error", m)}
                          />
                          <Show when={paymentQrisError()}>
                            <div class="fieldError">{paymentQrisError()}</div>
                          </Show>
                        </div>
                      </Show>
                      <button
                        class="btn btnPrimary"
                        type="button"
                        disabled={!canSubmitPayment()}
                        onClick={() => {
                          setTouchedPaymentMerchant(true);
                          setTouchedPaymentAmount(true);
                          setTouchedPaymentLink(true);
                          setTouchedPaymentQris(true);
                          if (!canSubmitPayment()) return;
                          void post();
                        }}
                      >
                        <span style="display: inline-flex; gap: 10px; align-items: center">
                          {isAction("post") ? <span class="spinner" /> : null}
                          <span>{isAction("post") ? "Submitting…" : "Submit"}</span>
                        </span>
                      </button>
                    </div>
                  </div>
                </Show>
              </div>
            </Show>
          </div>

          <Modal open={Boolean(selectedMerchant())} onClose={() => setSelectedMerchant(null)}>
            <Show when={selectedMerchant()}>
              {(m) => (
                <div style="display: grid; gap: 14px">
                  <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap">
                    <div>
                      <div style="font-weight: 700; letter-spacing: -0.02em; font-size: 20px">
                        {m().name}
                      </div>
                      <div style="color: rgba(250,250,255,0.62); font-size: 13px; margin-top: 2px">
                        {m().category}
                      </div>
                    </div>
                    <button class="btn" type="button" onClick={() => setSelectedMerchant(null)}>
                      Close
                    </button>
                  </div>

                  <div style="display: flex; gap: 10px; flex-wrap: wrap">
                    <button
                      class={`btn ${tab() === "LINK" ? "btnPrimary" : ""}`}
                      type="button"
                      onClick={() => setTab("LINK")}
                    >
                      Payment Links
                    </button>
                    <button
                      class={`btn ${tab() === "QRIS" ? "btnPrimary" : ""}`}
                      type="button"
                      onClick={() => setTab("QRIS")}
                    >
                      QRIS
                    </button>
                  </div>

                  <div class="modalListScroll">
                    <Show
                      when={selectedItems().length}
                      fallback={
                        loading() ? (
                          <div
                            style={{
                              display: "grid",
                              gap: "12px",
                              "grid-template-columns": "repeat(auto-fit, minmax(220px, 1fr))",
                            }}
                          >
                            <For each={[1, 2, 3, 4, 5, 6]}>
                              {() => (
                                <div class="card" style="padding: 0">
                                  <div class="cardInner" style="display: grid; gap: 10px">
                                    <div style="display: flex; gap: 10px; align-items: baseline; justify-content: space-between">
                                      <div
                                        class="skeleton"
                                        style="height: 16px; width: 46%; border-radius: 10px"
                                      />
                                      <div
                                        class="skeleton"
                                        style="height: 12px; width: 34%; border-radius: 10px"
                                      />
                                    </div>
                                    <div
                                      class="skeleton"
                                      style="height: 44px; width: 100%; border-radius: 14px"
                                    />
                                    <div
                                      class="skeleton"
                                      style="height: 44px; width: 100%; border-radius: 14px"
                                    />
                                  </div>
                                </div>
                              )}
                            </For>
                          </div>
                        ) : (
                          <div class="emptyCenter">
                            <div class="emptyLogo">CY</div>
                            <div class="emptyTitle">No payments yet</div>
                            <div class="emptyText">
                              Drop a payment link or QRIS and it’ll show up here.
                            </div>
                          </div>
                        )
                      }
                    >
                      <div
                        style={{
                          display: "grid",
                          gap: "12px",
                          "grid-template-columns":
                            tab() === "QRIS"
                              ? "repeat(auto-fit, minmax(260px, 1fr))"
                              : "repeat(auto-fit, minmax(220px, 1fr))",
                        }}
                      >
                        <For each={selectedItems()}>
                          {(it) => (
                            <div style="border: 1px solid rgba(255,255,255,0.12); border-radius: 18px; padding: 12px; display: grid; gap: 10px">
                              <div style="display: flex; gap: 10px; align-items: baseline; justify-content: space-between; flex-wrap: wrap">
                                <div style="color: rgba(250,250,255,0.86); font-size: 16px; font-weight: 750; letter-spacing: -0.02em">
                                  {formatIdr(it.totalAmount)}
                                </div>
                                <div style="color: rgba(250,250,255,0.62); font-size: 13px">
                                  {formatCountdown(it.expiresAt)}
                                </div>
                              </div>
                              <Show when={it.kind === "LINK" && it.paymentUrl}>
                                <button
                                  class="btn btnWide"
                                  type="button"
                                  disabled={Boolean(action())}
                                  onClick={() => {
                                    const url = it.paymentUrl;
                                    if (!url) return;
                                    openUrl(`${it.id}:link`, url);
                                  }}
                                >
                                  <span style="display: inline-flex; gap: 10px; align-items: center">
                                    {openItemId() === `${it.id}:link` ? (
                                      <span class="spinner" />
                                    ) : null}
                                    <span>Open</span>
                                  </span>
                                </button>
                              </Show>
                              <Show when={it.kind === "QRIS" && it.qrisUrl}>
                                <img
                                  src={it.qrisUrl ?? defaultQrisImage(m().name)}
                                  alt="QRIS"
                                  style="width: 100%; max-height: 420px; object-fit: contain; border-radius: 16px; border: 1px solid rgba(255,255,255,0.12)"
                                  onError={(e) => {
                                    const img = e.currentTarget;
                                    if (img.dataset.fallback === "1") return;
                                    img.dataset.fallback = "1";
                                    img.src = defaultQrisImage(m().name);
                                  }}
                                />
                                <button
                                  class="btn btnWide"
                                  type="button"
                                  disabled={Boolean(action())}
                                  onClick={() => {
                                    const url = it.qrisUrl;
                                    if (!url) return;
                                    openUrl(`${it.id}:qris`, url);
                                  }}
                                >
                                  <span style="display: inline-flex; gap: 10px; align-items: center">
                                    {openItemId() === `${it.id}:qris` ? (
                                      <span class="spinner" />
                                    ) : null}
                                    <span>Open</span>
                                  </span>
                                </button>
                              </Show>
                              <Show when={!readOnly() && it.status === "ACTIVE"}>
                                <button
                                  class="btn btnWide"
                                  type="button"
                                  disabled={Boolean(action())}
                                  onClick={() => void deactivate(it.id)}
                                >
                                  <span style="display: inline-flex; gap: 10px; align-items: center">
                                    {isAction("deactivate", it.id) ? (
                                      <span class="spinner" />
                                    ) : null}
                                    <span>
                                      {isAction("deactivate", it.id) ? "Taking Down…" : "Take Down"}
                                    </span>
                                  </span>
                                </button>
                              </Show>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>
                </div>
              )}
            </Show>
          </Modal>
        </div>
      </div>
    </div>
  );
}
