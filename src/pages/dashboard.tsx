import { DateTimePicker } from "@/components/date-time-picker";
import { ImageDropzone } from "@/components/image-dropzone";
import { Modal } from "@/components/modal";
import { NotificationBell } from "@/components/notification-bell";
import type { ToastKind } from "@/components/toast";
import { useAuth } from "@/state/auth";
import { useToast } from "@/state/toast";
import { api } from "@/utils/api";
import { type RouteSectionProps, useNavigate } from "@solidjs/router";
import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";

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

type Partner = { id: string; name: string };

type CashTransactionEntry = {
  id: string;
  status: "ACTIVE" | "INACTIVE" | "PENDING" | "DELETED";
  cashType: "CASH_IN" | "CASH_OUT";
  transactionDate: string;
  orderNumber: string;
  totalAmount: number;
  myFeeBps: number;
  customerFeeBps: number;
  merchantFeeBps: number;
  grossProfit: number;
  myFeeAmount: number;
  customerFeeAmount: number;
  merchantFeeAmount: number;
  grossFeeAmount: number;
  netProfit: number;
  customerTotalAmount: number;
  receiveFromMerchantAmount: number;
  payToCustomerAmount: number;
  merchant: { id: string; name: string };
  partner: { id: string; name: string };
};

type CashSummaryRow = {
  bucket: string;
  netProfit: number;
  grossProfit: number;
  cashIn: number;
  cashOut: number;
  pendingFunds: number;
};

function Sparkline(props: { values: number[]; stroke: string; fill: string }) {
  const values = props.values.slice(-24);
  const n = values.length;
  if (n < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const w = 120;
  const h = 34;
  const points = values.map((v, i) => {
    const x = (i / (n - 1)) * w;
    const y = h - ((v - min) / range) * (h - 2) - 1;
    return { x, y };
  });
  const lineD = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");
  const areaD = `M0,${h} ${points.map((p) => `L${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")} L${w},${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="34" aria-hidden="true">
      <path d={areaD} fill={props.fill} />
      <path d={lineD} fill="none" stroke={props.stroke} stroke-width="2" stroke-linecap="round" />
    </svg>
  );
}

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
  const [paymentMerchants, setPaymentMerchants] = createSignal<Merchant[]>([]);
  const [cashMerchants, setCashMerchants] = createSignal<Merchant[]>([]);
  const [items, setItems] = createSignal<PaymentItem[]>([]);
  const [notFound, setNotFound] = createSignal(false);
  const [selectedMerchant, setSelectedMerchant] = createSignal<Merchant | null>(null);
  const [tab, setTab] = createSignal<"LINK" | "QRIS">("LINK");
  const [menuSection, setMenuSection] = createSignal<"PAYMENTS" | "CASH">("PAYMENTS");

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
  const toDateTimeLocal = (ms: number) => {
    const d = new Date(ms);
    if (!Number.isFinite(d.getTime())) return "";
    const pad2 = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };
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

  const [cashPartners, setCashPartners] = createSignal<Partner[]>([]);
  const [cashEntries, setCashEntries] = createSignal<CashTransactionEntry[]>([]);
  const [cashEntriesTotal, setCashEntriesTotal] = createSignal(0);
  const [cashSummaryRows, setCashSummaryRows] = createSignal<CashSummaryRow[]>([]);
  const [cashEntriesRefreshTick, setCashEntriesRefreshTick] = createSignal(0);
  const [cashGroup, setCashGroup] = createSignal<
    "datetime" | "day" | "week" | "month" | "year" | "all"
  >("day");
  const [cashFrom, setCashFrom] = createSignal("");
  const [cashTo, setCashTo] = createSignal("");
  const [cashTypeFilter, setCashTypeFilter] = createSignal<"ALL" | "CASH_IN" | "CASH_OUT">("ALL");
  const [cashSearch, setCashSearch] = createSignal("");
  const [cashMerchantId, setCashMerchantId] = createSignal<string>("");
  const [cashPartnerId, setCashPartnerId] = createSignal<string>("");
  const [cashAdvancedOpen, setCashAdvancedOpen] = createSignal(false);
  const [cashAdvMerchantName, setCashAdvMerchantName] = createSignal("");
  const [cashAdvPartnerName, setCashAdvPartnerName] = createSignal("");
  const [cashExporting, setCashExporting] = createSignal<string | null>(null);
  const [cashExportOpen, setCashExportOpen] = createSignal(false);
  const [cashEditOpen, setCashEditOpen] = createSignal(false);
  const [cashLoading, setCashLoading] = createSignal(false);
  const [cashInquiryLoading, setCashInquiryLoading] = createSignal(false);
  const [cashPage, setCashPage] = createSignal(1);
  const [newCashPartnerName, setNewCashPartnerName] = createSignal("");
  const [newCashMerchantName, setNewCashMerchantName] = createSignal("");
  const [cashTxDate, setCashTxDate] = createSignal(toDateTimeLocal(Date.now()));
  const [cashTxOrderNumber, setCashTxOrderNumber] = createSignal("");
  const [cashTxTotalAmount, setCashTxTotalAmount] = createSignal("");
  const [cashTxCustomerFeePercent, setCashTxCustomerFeePercent] = createSignal("0");
  const [cashTxMerchantFeePercent, setCashTxMerchantFeePercent] = createSignal("0");
  const [cashTxCashType, setCashTxCashType] = createSignal<"CASH_IN" | "CASH_OUT">("CASH_IN");
  const [cashTxStatus, setCashTxStatus] = createSignal<"PENDING" | "ACTIVE">("PENDING");
  const [cashTxMerchantId, setCashTxMerchantId] = createSignal("");
  const [cashTxPartnerId, setCashTxPartnerId] = createSignal("");
  const [cashMutating, setCashMutating] = createSignal<string | null>(null);

  const [cashEditId, setCashEditId] = createSignal<string | null>(null);
  const [cashEditDate, setCashEditDate] = createSignal(toDateTimeLocal(Date.now()));
  const [cashEditOrderNumber, setCashEditOrderNumber] = createSignal("");
  const [cashEditTotalAmount, setCashEditTotalAmount] = createSignal("");
  const [cashEditCustomerFeePercent, setCashEditCustomerFeePercent] = createSignal("0");
  const [cashEditMerchantFeePercent, setCashEditMerchantFeePercent] = createSignal("0");
  const [cashEditCashType, setCashEditCashType] = createSignal<"CASH_IN" | "CASH_OUT">("CASH_IN");
  const [cashEditStatus, setCashEditStatus] = createSignal<"PENDING" | "ACTIVE">("PENDING");
  const [cashEditMerchantId, setCashEditMerchantId] = createSignal("");
  const [cashEditPartnerId, setCashEditPartnerId] = createSignal("");

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
  const formatMaybeIdr = (n: number | null): string => (n === null ? "—" : formatIdr(n));
  const formatCashRecordStatus = (s: string) =>
    s === "ACTIVE" ? "Success" : s === "PENDING" ? "Pending" : s;
  const formatPercent = (n: number) => {
    const fixed = n.toFixed(2);
    const trimmed = fixed.endsWith(".00")
      ? fixed.slice(0, -3)
      : fixed.endsWith("0")
        ? fixed.slice(0, -1)
        : fixed;
    return `${trimmed}%`;
  };
  const formatMaybePercent = (n: number | null): string => (n === null ? "—" : formatPercent(n));

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

  const normalizeExternalUrl = (raw: string) => {
    const url = raw.trim();
    if (!url) return url;
    if (/^(data|blob):/i.test(url)) return url;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) return url;
    if (url.startsWith("//")) return `https:${url}`;
    if (url.startsWith("/")) return `${globalThis.location.origin}${url}`;
    return `https://${url}`;
  };

  const openUrl = (id: string, url: string) => {
    setOpenItemId(id);
    try {
      window.open(normalizeExternalUrl(url), "_blank", "noopener,noreferrer");
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
        const res = await api.get<{ merchants?: Merchant[]; items?: PaymentItem[] }>(
          `/public/dashboard/${encodeURIComponent(publicToken)}`,
        );
        setNotFound(false);
        const all = Array.isArray(res.merchants) ? res.merchants : [];
        setPaymentMerchants(all.filter((m) => m.category !== "Cash In/Out"));
        setItems((res.items ?? []).filter((i) => i.status === "ACTIVE"));
        return;
      }

      const [m, p, c] = await Promise.all([
        api.get<{ merchants?: Merchant[] }>("/merchants/"),
        api.get<{ items?: PaymentItem[] }>("/payments/active"),
        api.get<{ categories?: { id: string | null; name: string }[] }>("/categories/"),
      ]);

      const nextMerchants = Array.isArray(m.merchants) ? m.merchants : [];
      const nextItems = Array.isArray(p.items) ? p.items : [];
      const nextCategories = Array.isArray(c.categories) ? c.categories : [];
      const nextPaymentMerchants = nextMerchants.filter((m) => m.category !== "Cash In/Out");

      setPaymentMerchants(nextPaymentMerchants);
      setItems(nextItems.filter((i) => i.status === "ACTIVE"));
      setCategoriesList(nextCategories);
      if (!postMerchantId() && nextPaymentMerchants.length)
        setPostMerchantId(nextPaymentMerchants[0].id);
      if (!newMerchantCategory() && nextCategories.length)
        setNewMerchantCategory(nextCategories[0].name);
    } catch (e) {
      if (publicToken) {
        setNotFound(true);
        return;
      }
      if (e instanceof Error && e.message === "UNAUTHORIZED") {
        forceSignIn("Session expired. Please sign in again.");
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

  const parseLocalToIso = (raw: string) => {
    const v = raw.trim();
    if (!v) return null;
    const d = new Date(v);
    if (!Number.isFinite(d.getTime())) return null;
    return d.toISOString();
  };

  const parsePercentInput = (raw: string) => {
    const v = raw.trim();
    if (!v) return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return n;
  };

  const refreshCashMerchants = async () => {
    const res = await api.get<{ merchants?: Merchant[] }>("/merchants/");
    const all = Array.isArray(res.merchants) ? res.merchants : [];
    const next = all.filter((m) => m.category === "Cash In/Out");
    next.sort((a, b) => a.name.localeCompare(b.name));
    setCashMerchants(next);
    if (!cashTxMerchantId().trim() && next.length) setCashTxMerchantId(next[0].id);
  };

  const refreshCashPartners = async () => {
    const res = await api.get<{ partners: Partner[] }>("/cash/partners");
    const next = Array.isArray(res.partners) ? res.partners : [];
    setCashPartners(next);
    if (!cashPartnerId().trim() && next.length) setCashPartnerId(next[0].id);
    if (!cashTxPartnerId().trim() && next.length) setCashTxPartnerId(next[0].id);
  };

  const refreshCashSummary = async () => {
    const sp = new URLSearchParams();
    sp.set("group", cashGroup());
    const fromIso = parseLocalToIso(cashFrom());
    const toIso = parseLocalToIso(cashTo());
    if (fromIso) sp.set("from", fromIso);
    if (toIso) sp.set("to", toIso);
    if (cashMerchantId().trim()) sp.set("merchantId", cashMerchantId().trim());
    if (cashPartnerId().trim()) sp.set("partnerId", cashPartnerId().trim());
    const res = await api.get<{ rows: CashSummaryRow[] }>(`/cash/summary?${sp.toString()}`);
    setCashSummaryRows(Array.isArray(res.rows) ? res.rows : []);
  };

  const cashPageSize = 25;
  const cashTotalPages = createMemo(() =>
    Math.max(1, Math.ceil(Math.max(0, cashEntriesTotal()) / cashPageSize)),
  );
  createEffect(() => {
    const p = cashPage();
    const tp = cashTotalPages();
    if (p > tp) setCashPage(tp);
    if (p < 1) setCashPage(1);
  });

  let cashInquiryReq = 0;
  const refreshCashEntries = async () => {
    cashInquiryReq += 1;
    const reqId = cashInquiryReq;
    setCashInquiryLoading(true);
    const sp = new URLSearchParams();
    const fromIso = parseLocalToIso(cashFrom());
    const toIso = parseLocalToIso(cashTo());
    if (fromIso) sp.set("from", fromIso);
    if (toIso) sp.set("to", toIso);
    if (cashTypeFilter() !== "ALL") sp.set("cashType", cashTypeFilter());
    if (cashSearch().trim()) sp.set("search", cashSearch().trim());
    if (cashMerchantId().trim()) sp.set("merchantId", cashMerchantId().trim());
    if (cashPartnerId().trim()) sp.set("partnerId", cashPartnerId().trim());
    if (cashAdvMerchantName().trim()) sp.set("merchantName", cashAdvMerchantName().trim());
    if (cashAdvPartnerName().trim()) sp.set("partnerName", cashAdvPartnerName().trim());
    sp.set("take", String(cashPageSize));
    sp.set("skip", String((cashPage() - 1) * cashPageSize));
    try {
      const res = await api.get<{ entries: CashTransactionEntry[]; totalCount?: number }>(
        `/cash/transactions?${sp.toString()}`,
      );
      if (reqId !== cashInquiryReq) return;
      setCashEntries(Array.isArray(res.entries) ? res.entries : []);
      setCashEntriesTotal(Math.max(0, Number(res.totalCount ?? 0)));
    } finally {
      if (reqId === cashInquiryReq) setCashInquiryLoading(false);
    }
  };

  const refreshCashAll = async (opts: { showSpinner: boolean }) => {
    if (readOnly()) return;
    if (opts.showSpinner) setCashLoading(true);
    try {
      await Promise.all([refreshCashPartners(), refreshCashSummary(), refreshCashEntries()]);
    } finally {
      if (opts.showSpinner) setCashLoading(false);
    }
  };

  const cashSummaryLatest = createMemo(() => {
    const rows = cashSummaryRows();
    if (!rows.length) return null;
    return rows.slice().sort((a, b) => b.bucket.localeCompare(a.bucket))[0];
  });
  const cashSummaryDisplay = createMemo(() => {
    const latest = cashSummaryLatest();
    return (
      latest ?? {
        bucket: "",
        netProfit: 0,
        grossProfit: 0,
        cashIn: 0,
        cashOut: 0,
        pendingFunds: 0,
      }
    );
  });
  const cashSummarySeries = createMemo(() => {
    const sorted = cashSummaryRows()
      .slice()
      .sort((a, b) => a.bucket.localeCompare(b.bucket));
    if (sorted.length === 0) {
      return {
        netProfit: [0, 0],
        grossProfit: [0, 0],
        cashIn: [0, 0],
        cashOut: [0, 0],
        pendingFunds: [0, 0],
      };
    }
    const last = sorted.slice(-24);
    return {
      netProfit: last.map((r) => r.netProfit),
      grossProfit: last.map((r) => r.grossProfit),
      cashIn: last.map((r) => r.cashIn),
      cashOut: last.map((r) => r.cashOut),
      pendingFunds: last.map((r) => r.pendingFunds),
    };
  });

  const hasCashMerchants = createMemo(() => cashMerchants().length > 0);
  const hasCashPartners = createMemo(() => cashPartners().length > 0);
  const showCashPartnerSection = createMemo(() => hasCashMerchants());
  const showCashRecordSection = createMemo(() => hasCashMerchants() && hasCashPartners());

  const cashBaseAmountRaw = createMemo(() => cashTxTotalAmount().replace(/[^\d]/g, ""));
  const cashBaseAmount = createMemo(() => {
    const raw = cashBaseAmountRaw();
    const n = raw ? Number(raw) : Number.NaN;
    return Number.isFinite(n) ? Math.trunc(n) : Number.NaN;
  });
  const cashBaseAmountValue = createMemo(() => {
    const v = cashBaseAmount();
    return Number.isFinite(v) && v > 0 ? v : null;
  });
  const cashCustomerFeePercentValue = createMemo(() =>
    parsePercentInput(cashTxCustomerFeePercent()),
  );
  const cashMerchantFeePercentValue = createMemo(() =>
    parsePercentInput(cashTxMerchantFeePercent()),
  );
  const cashFeeAmount = (base: number, pct: number) => Math.trunc((base * pct) / 100);
  const cashCustomerFeeAmount = createMemo(() => {
    const base = cashBaseAmount();
    const pct = cashCustomerFeePercentValue();
    if (!Number.isFinite(base) || base <= 0 || pct === null) return null;
    return cashFeeAmount(base, pct);
  });
  const cashMerchantFeeAmount = createMemo(() => {
    const base = cashBaseAmount();
    const pct = cashMerchantFeePercentValue();
    if (!Number.isFinite(base) || base <= 0 || pct === null) return null;
    return cashFeeAmount(base, pct);
  });
  const cashGrossFeeAmount = createMemo(() => {
    return cashCustomerFeeAmount();
  });
  const cashNetProfitAmount = createMemo(() => {
    const gross = cashGrossFeeAmount();
    const merchant = cashMerchantFeeAmount();
    if (gross === null || merchant === null) return null;
    return gross - merchant;
  });
  const cashNetProfitIsNegative = createMemo(() => {
    const v = cashNetProfitAmount();
    return typeof v === "number" && v < 0;
  });
  const cashReceiveFromMerchantAmount = createMemo(() => {
    const base = cashBaseAmount();
    const merchant = cashMerchantFeeAmount();
    if (!Number.isFinite(base) || base <= 0 || merchant === null) return null;
    return base - merchant;
  });
  const cashPayToCustomerAmount = createMemo(() => {
    const base = cashBaseAmount();
    const gross = cashGrossFeeAmount();
    if (!Number.isFinite(base) || base <= 0 || gross === null) return null;
    return base - gross;
  });

  const cashEditBaseAmountRaw = createMemo(() => cashEditTotalAmount().replace(/[^\d]/g, ""));
  const cashEditBaseAmount = createMemo(() => {
    const raw = cashEditBaseAmountRaw();
    const n = raw ? Number(raw) : Number.NaN;
    return Number.isFinite(n) ? Math.trunc(n) : Number.NaN;
  });
  const cashEditBaseAmountValue = createMemo(() => {
    const v = cashEditBaseAmount();
    return Number.isFinite(v) && v > 0 ? v : null;
  });
  const cashEditCustomerFeePercentValue = createMemo(() =>
    parsePercentInput(cashEditCustomerFeePercent()),
  );
  const cashEditMerchantFeePercentValue = createMemo(() =>
    parsePercentInput(cashEditMerchantFeePercent()),
  );
  const cashEditCustomerFeeAmount = createMemo(() => {
    const base = cashEditBaseAmount();
    const pct = cashEditCustomerFeePercentValue();
    if (!Number.isFinite(base) || base <= 0 || pct === null) return null;
    return cashFeeAmount(base, pct);
  });
  const cashEditMerchantFeeAmount = createMemo(() => {
    const base = cashEditBaseAmount();
    const pct = cashEditMerchantFeePercentValue();
    if (!Number.isFinite(base) || base <= 0 || pct === null) return null;
    return cashFeeAmount(base, pct);
  });
  const cashEditGrossFeeAmount = createMemo(() => cashEditCustomerFeeAmount());
  const cashEditNetProfitAmount = createMemo(() => {
    const gross = cashEditGrossFeeAmount();
    const merchant = cashEditMerchantFeeAmount();
    if (gross === null || merchant === null) return null;
    return gross - merchant;
  });
  const cashEditReceiveFromMerchantAmount = createMemo(() => {
    const base = cashEditBaseAmount();
    const merchant = cashEditMerchantFeeAmount();
    if (!Number.isFinite(base) || base <= 0 || merchant === null) return null;
    return base - merchant;
  });
  const cashEditPayToCustomerAmount = createMemo(() => {
    const base = cashEditBaseAmount();
    const gross = cashEditGrossFeeAmount();
    if (!Number.isFinite(base) || base <= 0 || gross === null) return null;
    return base - gross;
  });

  const downloadCashExport = async (format: "pdf" | "xlsx" | "xml" | "json" | "csv") => {
    if (cashExporting()) return;
    setCashExporting(format);
    try {
      const rawBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";
      const useDevProxy = (() => {
        if (!import.meta.env.DEV) return false;
        if (typeof rawBaseUrl !== "string") return false;
        const v = rawBaseUrl.trim().toLowerCase();
        return v.startsWith("http://") || v.startsWith("https://");
      })();
      const baseUrl = useDevProxy ? "" : rawBaseUrl;

      const sp = new URLSearchParams();
      sp.set("format", format);
      const fromIso = parseLocalToIso(cashFrom());
      const toIso = parseLocalToIso(cashTo());
      if (fromIso) sp.set("from", fromIso);
      if (toIso) sp.set("to", toIso);
      if (cashTypeFilter() !== "ALL") sp.set("cashType", cashTypeFilter());
      if (cashSearch().trim()) sp.set("search", cashSearch().trim());
      if (cashMerchantId().trim()) sp.set("merchantId", cashMerchantId().trim());
      if (cashPartnerId().trim()) sp.set("partnerId", cashPartnerId().trim());
      if (cashAdvMerchantName().trim()) sp.set("merchantName", cashAdvMerchantName().trim());
      if (cashAdvPartnerName().trim()) sp.set("partnerName", cashAdvPartnerName().trim());

      const headers = new Headers();
      try {
        const token = localStorage.getItem("auth_token");
        if (token) headers.set("authorization", `Bearer ${token}`);
      } catch {}
      try {
        const existing = localStorage.getItem("device_id");
        const deviceId = existing?.trim() ? existing.trim() : crypto.randomUUID();
        if (!existing?.trim()) localStorage.setItem("device_id", deviceId);
        headers.set("x-device-id", deviceId);
      } catch {}

      const res = await fetch(`${baseUrl}/cash/export?${sp.toString()}`, {
        method: "GET",
        headers,
        credentials: "include",
      });
      if (!res.ok) {
        const text = (await res.text()).trim();
        throw new Error(text || `HTTP_${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("content-disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(cd);
      a.download = match?.[1] ?? `cash-in-out.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("success", "Export downloaded.");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "EXPORT_FAILED");
    } finally {
      setCashExporting(null);
    }
  };

  createEffect(() => {
    if (menuSection() !== "CASH") {
      setCashExportOpen(false);
      return;
    }
    if (!cashExportOpen()) return;
    const onDown = (ev: MouseEvent | TouchEvent) => {
      const t = ev.target;
      if (!(t instanceof Node)) return;
      const wrap = document.querySelector(".exportWrap");
      if (!wrap) return;
      if (!wrap.contains(t)) setCashExportOpen(false);
    };
    document.addEventListener("mousedown", onDown, { capture: true });
    document.addEventListener("touchstart", onDown, { capture: true });
    onCleanup(() => {
      document.removeEventListener("mousedown", onDown, { capture: true });
      document.removeEventListener("touchstart", onDown, { capture: true });
    });
  });

  const refreshBusy = createMemo(() => (menuSection() === "CASH" ? cashLoading() : syncing()));
  const refreshDisabled = createMemo(() =>
    menuSection() === "CASH"
      ? cashLoading() || Boolean(cashMutating())
      : syncing() || Boolean(action()),
  );
  const refreshActiveMenu = async () => {
    if (menuSection() === "CASH") {
      await Promise.all([refreshCashMerchants(), refreshCashAll({ showSpinner: true })]);
      return;
    }
    await refresh({ showSpinner: true, showSkeleton: false });
  };

  createEffect(() => {
    if (!readOnly() && (auth.loading() || !auth.me())) return;
    if (!readOnly() && menuSection() !== "PAYMENTS") return;
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
    if (menuSection() !== "CASH") return;
    if (readOnly()) return;
    if (auth.loading() || !auth.me()) return;
    void (async () => {
      await Promise.all([refreshCashMerchants(), refreshCashAll({ showSpinner: true })]);
    })();
  });

  createEffect(() => {
    if (menuSection() !== "CASH") return;
    if (readOnly()) return;
    if (auth.loading() || !auth.me()) return;
    cashPage();
    cashEntriesRefreshTick();
    void refreshCashEntries();
  });

  createEffect(() => {
    if (menuSection() !== "CASH") return;
    if (readOnly()) return;
    if (auth.loading() || !auth.me()) return;
    cashFrom();
    cashTo();
    cashTypeFilter();
    cashMerchantId();
    cashPartnerId();
    cashAdvMerchantName();
    cashAdvPartnerName();
    setCashPage(1);
    setCashEntriesRefreshTick((v) => v + 1);
  });

  createEffect(() => {
    if (menuSection() !== "CASH") return;
    if (readOnly()) return;
    if (auth.loading() || !auth.me()) return;
    cashGroup();
    cashFrom();
    cashTo();
    cashMerchantId();
    cashPartnerId();
    void refreshCashSummary();
  });

  createEffect(() => {
    if (menuSection() !== "CASH") return;
    if (readOnly()) return;
    if (auth.loading() || !auth.me()) return;
    const raw = cashSearch();
    const trimmed = raw.trim();
    const id = globalThis.setTimeout(
      () => {
        setCashPage(1);
        setCashEntriesRefreshTick((v) => v + 1);
      },
      trimmed ? 350 : 0,
    );
    onCleanup(() => globalThis.clearTimeout(id));
  });

  createEffect(() => {
    if (menuSection() !== "CASH") return;
    if (!cashTxMerchantId().trim() && cashMerchants().length)
      setCashTxMerchantId(cashMerchants()[0].id);
  });

  createEffect(() => {
    if (readOnly()) return;
    if (adminChecked()) return;
    if (!hasLocalToken()) return;
    setAdminChecked(true);
    if (auth.me()?.role === "SUPER") {
      setHasAdminAccess(true);
      setAdminAccessLoading(false);
      return;
    }
    setAdminAccessLoading(true);
    void api
      .get<unknown>("/api/admin/access")
      .then(() => setHasAdminAccess(true))
      .catch(() => setHasAdminAccess(false))
      .finally(() => setAdminAccessLoading(false));
  });

  const categories = createMemo(() => groupByCategory(paymentMerchants()));
  const hasAnyCategories = createMemo(() => categoriesList().length > 0);
  const hasAnyMerchants = createMemo(() => paymentMerchants().length > 0);
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

  const addCashPartner = async () => {
    if (readOnly()) return;
    const name = newCashPartnerName().trim();
    if (name.length < 2) return;
    if (cashMutating()) return;
    setCashMutating("add_partner");
    showToast("progress", "Registering partner…");
    try {
      const res = await api.post<{ partner: Partner }>("/cash/partners", { name });
      setNewCashPartnerName("");
      if (res.partner) {
        setCashPartners((prev) => {
          const next = [...prev.filter((p) => p.id !== res.partner.id), res.partner];
          next.sort((a, b) => a.name.localeCompare(b.name));
          return next;
        });
        if (!cashTxPartnerId().trim()) setCashTxPartnerId(res.partner.id);
      }
      showToast("success", "Partner registered.");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "ADD_PARTNER_FAILED");
    } finally {
      setCashMutating(null);
    }
  };

  const addCashMerchant = async () => {
    if (readOnly()) return;
    const name = newCashMerchantName().trim();
    if (name.length < 2) return;
    if (cashMutating()) return;
    setCashMutating("add_merchant");
    showToast("progress", "Registering merchant…");
    try {
      const res = await api.post<{ merchant: Merchant }>("/merchants/", {
        name,
        category: "Cash In/Out",
      });
      setNewCashMerchantName("");
      if (res.merchant) {
        setCashMerchants((prev) => {
          const next = [...prev.filter((m) => m.id !== res.merchant.id), res.merchant];
          next.sort((a, b) => a.name.localeCompare(b.name));
          return next;
        });
        setCashTxMerchantId(res.merchant.id);
      }
      showToast("success", "Merchant registered.");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "ADD_MERCHANT_FAILED");
    } finally {
      setCashMutating(null);
    }
  };

  const addCashTransaction = async () => {
    if (readOnly()) return;
    if (cashMutating()) return;
    const parsePercent = (raw: string) => {
      const v = raw.trim();
      if (!v) return null;
      const n = Number(v);
      if (!Number.isFinite(n)) return null;
      return n;
    };
    const transactionDateIso = parseLocalToIso(cashTxDate());
    if (!transactionDateIso) {
      showToast("error", "Transaction date is required.");
      return;
    }
    const orderNumber = cashTxOrderNumber().trim();
    if (orderNumber.length < 2) {
      showToast("error", "Order number is required.");
      return;
    }
    const amountRaw = cashTxTotalAmount().replace(/[^\d]/g, "");
    const totalAmount = amountRaw ? Number(amountRaw) : Number.NaN;
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      showToast("error", "Base total amount is required.");
      return;
    }
    const customerFeePercent = parsePercent(cashTxCustomerFeePercent());
    const merchantFeePercent = parsePercent(cashTxMerchantFeePercent());
    if (customerFeePercent === null || customerFeePercent < 0 || customerFeePercent > 100) {
      showToast("error", "Customer fee must be a number between 0 and 100.");
      return;
    }
    if (merchantFeePercent === null || merchantFeePercent < 0 || merchantFeePercent > 100) {
      showToast("error", "Merchant fee must be a number between 0 and 100.");
      return;
    }
    if (!cashTxMerchantId().trim()) {
      showToast("error", "Merchant is required.");
      return;
    }
    if (!cashTxPartnerId().trim()) {
      showToast("error", "Partner is required.");
      return;
    }

    setCashMutating("add_tx");
    showToast("progress", "Adding cash record…");
    try {
      await api.post("/cash/transactions", {
        cashType: cashTxCashType(),
        transactionDate: transactionDateIso,
        orderNumber,
        totalAmount,
        customerFeePercent,
        merchantFeePercent,
        merchantId: cashTxMerchantId(),
        partnerId: cashTxPartnerId(),
        status: cashTxStatus(),
      });
      setCashTxOrderNumber("");
      setCashTxTotalAmount("");
      setCashTxStatus("PENDING");
      showToast("success", "Record added.");
      setCashPage(1);
      await refreshCashAll({ showSpinner: true });
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "ADD_RECORD_FAILED");
    } finally {
      setCashMutating(null);
    }
  };

  const openCashEdit = (entry: CashTransactionEntry) => {
    if (readOnly()) return;
    setCashEditId(entry.id);
    setCashEditDate(toDateTimeLocal(new Date(entry.transactionDate).getTime()));
    setCashEditOrderNumber(entry.orderNumber);
    setCashEditTotalAmount(String(entry.totalAmount));
    setCashEditCustomerFeePercent(String(entry.customerFeeBps / 100));
    setCashEditMerchantFeePercent(String(entry.merchantFeeBps / 100));
    setCashEditCashType(entry.cashType);
    setCashEditStatus(entry.status === "ACTIVE" ? "ACTIVE" : "PENDING");
    setCashEditMerchantId(entry.merchant.id);
    setCashEditPartnerId(entry.partner.id);
    setCashEditOpen(true);
  };

  const saveCashEdit = async () => {
    if (readOnly()) return;
    const id = cashEditId();
    if (!id) return;
    if (cashMutating()) return;

    const transactionDateIso = parseLocalToIso(cashEditDate());
    if (!transactionDateIso) {
      showToast("error", "Transaction date is required.");
      return;
    }
    const orderNumber = cashEditOrderNumber().trim();
    if (orderNumber.length < 2) {
      showToast("error", "Order number is required.");
      return;
    }
    const amountRaw = cashEditTotalAmount().replace(/[^\d]/g, "");
    const totalAmount = amountRaw ? Number(amountRaw) : Number.NaN;
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      showToast("error", "Base total amount is required.");
      return;
    }
    const customerFeePercent = parsePercentInput(cashEditCustomerFeePercent());
    const merchantFeePercent = parsePercentInput(cashEditMerchantFeePercent());
    if (customerFeePercent === null || customerFeePercent < 0 || customerFeePercent > 100) {
      showToast("error", "Customer fee must be a number between 0 and 100.");
      return;
    }
    if (merchantFeePercent === null || merchantFeePercent < 0 || merchantFeePercent > 100) {
      showToast("error", "Merchant fee must be a number between 0 and 100.");
      return;
    }
    if (!cashEditMerchantId().trim()) {
      showToast("error", "Merchant is required.");
      return;
    }
    if (!cashEditPartnerId().trim()) {
      showToast("error", "Partner is required.");
      return;
    }

    setCashMutating("edit_tx");
    showToast("progress", "Updating cash record…");
    try {
      await api.post(`/cash/transactions/${encodeURIComponent(id)}`, {
        cashType: cashEditCashType(),
        transactionDate: transactionDateIso,
        orderNumber,
        totalAmount,
        customerFeePercent,
        merchantFeePercent,
        merchantId: cashEditMerchantId(),
        partnerId: cashEditPartnerId(),
        status: cashEditStatus(),
      });
      setCashEditOpen(false);
      showToast("success", "Record updated.");
      await refreshCashAll({ showSpinner: true });
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "UPDATE_RECORD_FAILED");
    } finally {
      setCashMutating(null);
    }
  };

  const post = async () => {
    if (readOnly()) return;
    if (paymentMerchants().length === 0) {
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
  const _isSuper = createMemo(() => auth.me()?.role === "SUPER");
  const totalLinks = createMemo(() => items().filter((i) => i.kind === "LINK").length);
  const totalQris = createMemo(() => items().filter((i) => i.kind === "QRIS").length);
  const [layoutMode, setLayoutMode] = createSignal<"CATEGORY" | "MERCHANT" | "LINK" | "QRIS">(
    "CATEGORY",
  );

  const merchantLayoutPageSize = 20;
  const [merchantLayoutPage, setMerchantLayoutPage] = createSignal(1);
  const merchantsSorted = createMemo(() =>
    paymentMerchants()
      .slice()
      .sort((a: Merchant, b: Merchant) => a.name.localeCompare(b.name)),
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
              <div style="color: var(--muted)">Loading…</div>
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
            <div style="color: var(--muted)">Loading…</div>
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
                onClick={() => void refreshActiveMenu()}
                disabled={refreshDisabled()}
              >
                <span style="display: inline-flex; gap: 10px; align-items: center; justify-content: center; width: 100%">
                  {refreshBusy() ? <span class="spinner" /> : null}
                  {!refreshBusy() ? (
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
                  <span>{refreshBusy() ? "Refreshing…" : "Refresh"}</span>
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
                        <title>Sign out</title>
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <path d="M16 17l5-5-5-5" />
                        <path d="M21 12H9" />
                      </svg>
                    ) : null}
                    <span>{isAction("signout") ? "Signing out…" : "Sign Out"}</span>
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
                <div class="dashMenu">
                  <div class="dashMenuSection">
                    <div class="dashMenuLabel">Payment Links</div>
                    <div class="dashMenuRow">
                      <button
                        classList={{
                          dashMenuBtn: true,
                          dashMenuBtnActive:
                            menuSection() === "PAYMENTS" && layoutMode() === "CATEGORY",
                        }}
                        type="button"
                        onClick={() => {
                          setMenuSection("PAYMENTS");
                          setLayoutMode("CATEGORY");
                        }}
                      >
                        Category
                      </button>
                      <button
                        classList={{
                          dashMenuBtn: true,
                          dashMenuBtnActive:
                            menuSection() === "PAYMENTS" && layoutMode() === "MERCHANT",
                        }}
                        type="button"
                        onClick={() => {
                          setMenuSection("PAYMENTS");
                          setLayoutMode("MERCHANT");
                        }}
                      >
                        Merchant
                      </button>
                      <button
                        classList={{
                          dashMenuBtn: true,
                          dashMenuBtnActive:
                            menuSection() === "PAYMENTS" && layoutMode() === "LINK",
                        }}
                        type="button"
                        onClick={() => {
                          setMenuSection("PAYMENTS");
                          setLayoutMode("LINK");
                        }}
                      >
                        Payment Link
                      </button>
                      <button
                        classList={{
                          dashMenuBtn: true,
                          dashMenuBtnActive:
                            menuSection() === "PAYMENTS" && layoutMode() === "QRIS",
                        }}
                        type="button"
                        onClick={() => {
                          setMenuSection("PAYMENTS");
                          setLayoutMode("QRIS");
                        }}
                      >
                        QRIS
                      </button>
                    </div>
                  </div>

                  <Show when={!readOnly()}>
                    <div class="dashMenuSection">
                      <div class="dashMenuLabel">Cash In/Out</div>
                      <div class="dashMenuRow">
                        <button
                          classList={{
                            dashMenuBtn: true,
                            dashMenuBtnActive: menuSection() === "CASH",
                          }}
                          type="button"
                          onClick={() => setMenuSection("CASH")}
                        >
                          Cash In/Out
                        </button>
                      </div>
                    </div>
                  </Show>
                </div>

                <Show when={menuSection() === "PAYMENTS"}>
                  <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap">
                    <h2 class="sectionH2">Totals:</h2>
                    <div class="statPills">
                      <span class="statPill">
                        Merchants: <b>{paymentMerchants().length}</b>
                      </span>
                      <span class="statPill">
                        Payment Link/s: <b>{totalLinks()}</b>
                      </span>
                      <span class="statPill">
                        QRIS: <b>{totalQris()}</b>
                      </span>
                    </div>
                  </div>
                </Show>

                <Show when={menuSection() === "CASH"}>
                  <div class="cashTop">
                    <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap">
                      <h2 class="sectionH2">Cash In/Out:</h2>
                      <div class="statPills">
                        <span class="statPill">
                          Entries: <b>{cashEntries().length}</b>
                        </span>
                        <span class="statPill">
                          Partners: <b>{cashPartners().length}</b>
                        </span>
                      </div>
                    </div>

                    <div class="cashFilters">
                      <div class="field cashFilterField">
                        <label for="cash_from">From</label>
                        <DateTimePicker
                          id="cash_from"
                          value={cashFrom}
                          onChange={setCashFrom}
                          disabled={cashInquiryLoading() || cashLoading()}
                        />
                      </div>
                      <div class="field cashFilterField">
                        <label for="cash_to">To</label>
                        <DateTimePicker
                          id="cash_to"
                          value={cashTo}
                          onChange={setCashTo}
                          disabled={cashInquiryLoading() || cashLoading()}
                        />
                      </div>
                      <div class="field cashFilterField">
                        <label for="cash_type">Cash Flow Type</label>
                        <select
                          id="cash_type"
                          class="select"
                          value={cashTypeFilter()}
                          onChange={(e) =>
                            setCashTypeFilter(
                              e.currentTarget.value as "ALL" | "CASH_IN" | "CASH_OUT",
                            )
                          }
                          disabled={cashInquiryLoading() || cashLoading()}
                        >
                          <option value="ALL">All</option>
                          <option value="CASH_IN">Cash In</option>
                          <option value="CASH_OUT">Cash Out</option>
                        </select>
                      </div>
                      <div class="field cashFilterField">
                        <label for="cash_merchant">Merchant</label>
                        <select
                          id="cash_merchant"
                          class="select"
                          value={cashMerchantId()}
                          onChange={(e) => setCashMerchantId(e.currentTarget.value)}
                          disabled={cashInquiryLoading() || cashLoading()}
                        >
                          <option value="">All</option>
                          <For each={cashMerchants()}>
                            {(m) => <option value={m.id}>{m.name}</option>}
                          </For>
                        </select>
                      </div>
                      <div class="field cashFilterField">
                        <label for="cash_partner">Partner</label>
                        <select
                          id="cash_partner"
                          class="select"
                          value={cashPartnerId()}
                          onChange={(e) => setCashPartnerId(e.currentTarget.value)}
                          disabled={cashInquiryLoading() || cashLoading()}
                        >
                          <option value="">All</option>
                          <For each={cashPartners()}>
                            {(p) => <option value={p.id}>{p.name}</option>}
                          </For>
                        </select>
                      </div>
                      <div class="field cashFilterField">
                        <label for="cash_search">Search</label>
                        <div class="inputWithBtn">
                          <input
                            id="cash_search"
                            value={cashSearch()}
                            onInput={(e) => setCashSearch(e.currentTarget.value)}
                            placeholder="Search across all fields…"
                          />
                          <button
                            class="btn"
                            type="button"
                            onClick={() => setCashAdvancedOpen(true)}
                            disabled={cashInquiryLoading() || cashLoading()}
                            aria-label="Advanced filters"
                          >
                            <span style="display: inline-flex; gap: 10px; align-items: center">
                              <span style="font-size: 18px; line-height: 1">⌕</span>
                              <span>Filters</span>
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div class="cashExports">
                      <div class="dashMenuLabel" style="margin: 0">
                        Export
                      </div>
                      <div class="exportWrap">
                        <button
                          class="btn btnHero exportBtn"
                          type="button"
                          disabled={cashLoading() || Boolean(cashExporting())}
                          aria-haspopup="menu"
                          aria-expanded={cashExportOpen()}
                          onClick={() => setCashExportOpen((v) => !v)}
                        >
                          <span class="exportBtnInner">
                            {cashExporting() ? <span class="spinner" /> : null}
                            {!cashExporting() ? (
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                              >
                                <title>Export</title>
                                <path d="M12 3v12" />
                                <path d="M7 8l5-5 5 5" />
                                <path d="M5 21h14a2 2 0 0 0 2-2v-4" />
                                <path d="M3 15v4a2 2 0 0 0 2 2" />
                              </svg>
                            ) : null}
                            <span class="exportBtnText">
                              {cashExporting() ? "Exporting…" : "Export"}
                            </span>
                            <span class="exportBtnChevron">{cashExportOpen() ? "▴" : "▾"}</span>
                          </span>
                        </button>
                        <Show when={cashExportOpen()}>
                          <div class="exportMenu" role="menu">
                            <For each={["pdf", "xlsx", "xml", "json", "csv"] as const}>
                              {(fmt) => (
                                <button
                                  class="exportItem"
                                  type="button"
                                  role="menuitem"
                                  disabled={cashLoading() || Boolean(cashExporting())}
                                  onClick={() => {
                                    setCashExportOpen(false);
                                    void downloadCashExport(fmt);
                                  }}
                                >
                                  <span class="exportItemInner">
                                    <span class="exportItemIcon" aria-hidden="true">
                                      {fmt === "pdf" ? (
                                        <svg
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          stroke-width="2"
                                        >
                                          <title>PDF</title>
                                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                          <path d="M14 2v6h6" />
                                          <path d="M8 13h8" />
                                          <path d="M8 17h6" />
                                        </svg>
                                      ) : fmt === "xlsx" ? (
                                        <svg
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          stroke-width="2"
                                        >
                                          <title>XLSX</title>
                                          <path d="M3 3h18v18H3z" />
                                          <path d="M3 9h18" />
                                          <path d="M9 21V9" />
                                        </svg>
                                      ) : fmt === "xml" ? (
                                        <svg
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          stroke-width="2"
                                        >
                                          <title>XML</title>
                                          <path d="M8 6L3 12l5 6" />
                                          <path d="M16 6l5 6-5 6" />
                                          <path d="M10 19l4-14" />
                                        </svg>
                                      ) : fmt === "json" ? (
                                        <svg
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          stroke-width="2"
                                        >
                                          <title>JSON</title>
                                          <path d="M8 7c0-2 1-3 3-3" />
                                          <path d="M8 17c0 2 1 3 3 3" />
                                          <path d="M16 7c0-2-1-3-3-3" />
                                          <path d="M16 17c0 2-1 3-3 3" />
                                        </svg>
                                      ) : (
                                        <svg
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          stroke-width="2"
                                        >
                                          <title>CSV</title>
                                          <path d="M4 6h16" />
                                          <path d="M4 12h16" />
                                          <path d="M4 18h16" />
                                          <path d="M8 6v12" />
                                          <path d="M16 6v12" />
                                        </svg>
                                      )}
                                    </span>
                                    <span class="exportItemLabel" style="text-transform: uppercase">
                                      {fmt}
                                    </span>
                                  </span>
                                </button>
                              )}
                            </For>
                          </div>
                        </Show>
                      </div>
                    </div>

                    <div class="cashSummary">
                      <div class="cashSummaryBar">
                        <div class="dashMenuLabel" style="margin: 0">
                          Summary
                        </div>
                        <div class="cashSummaryControls">
                          <select
                            class="select"
                            value={cashGroup()}
                            onChange={(e) =>
                              setCashGroup(
                                e.currentTarget.value as
                                  | "datetime"
                                  | "day"
                                  | "week"
                                  | "month"
                                  | "year"
                                  | "all",
                              )
                            }
                            disabled={cashLoading()}
                          >
                            <option value="datetime">Date/Time</option>
                            <option value="day">Day</option>
                            <option value="week">Week</option>
                            <option value="month">Month</option>
                            <option value="year">Year</option>
                            <option value="all">All Time</option>
                          </select>
                        </div>
                      </div>
                      <div class="cashSummaryCards">
                        <div class="cashSummaryCard">
                          <div class="cashSummaryCardTop">
                            <div class="cashSummaryIcon cashIconNet">
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                              >
                                <title>Net Profit</title>
                                <path d="M3 12h18" />
                                <path d="M12 3v18" />
                              </svg>
                            </div>
                            <div>
                              <div class="cashSummaryLabel">Net Profit</div>
                              <div class="cashSummaryValue">
                                {formatIdr(cashSummaryDisplay().netProfit)}
                              </div>
                            </div>
                          </div>
                          <div class="cashSummarySpark">
                            <Sparkline
                              values={cashSummarySeries().netProfit}
                              stroke="rgba(124, 255, 214, 0.9)"
                              fill="rgba(124, 255, 214, 0.12)"
                            />
                          </div>
                        </div>

                        <div class="cashSummaryCard">
                          <div class="cashSummaryCardTop">
                            <div class="cashSummaryIcon cashIconGross">
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                              >
                                <title>Customer Fees</title>
                                <path d="M4 19V5" />
                                <path d="M4 19h16" />
                                <path d="M8 15l3-3 3 2 4-5" />
                              </svg>
                            </div>
                            <div>
                              <div class="cashSummaryLabel">Customer Fees</div>
                              <div class="cashSummaryValue">
                                {formatIdr(cashSummaryDisplay().grossProfit)}
                              </div>
                            </div>
                          </div>
                          <div class="cashSummarySpark">
                            <Sparkline
                              values={cashSummarySeries().grossProfit}
                              stroke="rgba(157, 124, 255, 0.9)"
                              fill="rgba(157, 124, 255, 0.12)"
                            />
                          </div>
                        </div>

                        <div class="cashSummaryCard">
                          <div class="cashSummaryCardTop">
                            <div class="cashSummaryIcon cashIconIn">
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                              >
                                <title>Cash In</title>
                                <path d="M12 19V5" />
                                <path d="M5 12l7-7 7 7" />
                              </svg>
                            </div>
                            <div>
                              <div class="cashSummaryLabel">Cash In</div>
                              <div class="cashSummaryValue">
                                {formatIdr(cashSummaryDisplay().cashIn)}
                              </div>
                            </div>
                          </div>
                          <div class="cashSummarySpark">
                            <Sparkline
                              values={cashSummarySeries().cashIn}
                              stroke="rgba(124, 255, 214, 0.9)"
                              fill="rgba(124, 255, 214, 0.12)"
                            />
                          </div>
                        </div>

                        <div class="cashSummaryCard">
                          <div class="cashSummaryCardTop">
                            <div class="cashSummaryIcon cashIconOut">
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                              >
                                <title>Cash Out</title>
                                <path d="M12 5v14" />
                                <path d="M19 12l-7 7-7-7" />
                              </svg>
                            </div>
                            <div>
                              <div class="cashSummaryLabel">Cash Out</div>
                              <div class="cashSummaryValue">
                                {formatIdr(cashSummaryDisplay().cashOut)}
                              </div>
                            </div>
                          </div>
                          <div class="cashSummarySpark">
                            <Sparkline
                              values={cashSummarySeries().cashOut}
                              stroke="rgba(255, 124, 207, 0.9)"
                              fill="rgba(255, 124, 207, 0.1)"
                            />
                          </div>
                        </div>

                        <div class="cashSummaryCard">
                          <div class="cashSummaryCardTop">
                            <div class="cashSummaryIcon cashIconPending">
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                              >
                                <title>Pending Funds</title>
                                <path d="M12 8v5l3 2" />
                                <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                              </svg>
                            </div>
                            <div>
                              <div class="cashSummaryLabel">Pending Funds</div>
                              <div class="cashSummaryValue">
                                {formatIdr(cashSummaryDisplay().pendingFunds)}
                              </div>
                            </div>
                          </div>
                          <div class="cashSummarySpark">
                            <Sparkline
                              values={cashSummarySeries().pendingFunds}
                              stroke="rgba(255, 255, 255, 0.78)"
                              fill="rgba(255, 255, 255, 0.06)"
                            />
                          </div>
                        </div>
                      </div>
                      <Show when={cashSummaryRows().length > 1}>
                        <div class="cashSummaryTableWrap">
                          <table class="cashTable">
                            <thead>
                              <tr>
                                <th>Bucket</th>
                                <th>Net</th>
                                <th>Gross</th>
                                <th>Cash In</th>
                                <th>Cash Out</th>
                                <th>Pending</th>
                              </tr>
                            </thead>
                            <tbody>
                              <For
                                each={cashSummaryRows()
                                  .slice()
                                  .sort((a, b) => b.bucket.localeCompare(a.bucket))
                                  .slice(0, 80)}
                              >
                                {(r) => (
                                  <tr>
                                    <td>{r.bucket.slice(0, 19).replace("T", " ")}</td>
                                    <td>{formatIdr(r.netProfit)}</td>
                                    <td>{formatIdr(r.grossProfit)}</td>
                                    <td>{formatIdr(r.cashIn)}</td>
                                    <td>{formatIdr(r.cashOut)}</td>
                                    <td>{formatIdr(r.pendingFunds)}</td>
                                  </tr>
                                )}
                              </For>
                            </tbody>
                          </table>
                        </div>
                      </Show>
                    </div>

                    <div class="cashData">
                      <div class="cashSummaryBar">
                        <div class="dashMenuLabel" style="margin: 0">
                          Inquiry
                        </div>
                        <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center; justify-content: space-between">
                          <div style="color: var(--muted); font-size: 13px">
                            Page {cashPage()} of {cashTotalPages()} • Showing{" "}
                            {Math.min(
                              cashPageSize,
                              Math.max(0, cashEntriesTotal() - (cashPage() - 1) * cashPageSize),
                            )}{" "}
                            of {cashEntriesTotal()}
                          </div>
                          <button
                            class="btn"
                            type="button"
                            disabled={cashInquiryLoading() || cashPage() <= 1}
                            onClick={() => setCashPage((p) => Math.max(1, p - 1))}
                          >
                            Prev
                          </button>
                          <button
                            class="btn"
                            type="button"
                            disabled={cashInquiryLoading() || cashPage() >= cashTotalPages()}
                            onClick={() => setCashPage((p) => Math.min(cashTotalPages(), p + 1))}
                          >
                            Next
                          </button>
                        </div>
                      </div>
                      <Show
                        when={cashEntriesTotal() > 0 || cashInquiryLoading()}
                        fallback={
                          <div class="emptyCenter" style="margin-top: 12px">
                            <div class="emptyLogo">CY</div>
                            <div class="emptyTitle">No cash records yet</div>
                            <div class="emptyText">Add a cash record and it’ll show up here.</div>
                          </div>
                        }
                      >
                        <Show
                          when={!cashInquiryLoading()}
                          fallback={
                            <div class="cashSummaryTableWrap cashInquiryScroll">
                              <div class="skeleton" style="height: 260px" />
                            </div>
                          }
                        >
                          <div class="cashSummaryTableWrap cashInquiryScroll">
                            <table class="cashTable">
                              <thead>
                                <tr>
                                  <th>Date</th>
                                  <th>Type</th>
                                  <th>Status</th>
                                  <th>Order</th>
                                  <th>Partner</th>
                                  <th>Merchant</th>
                                  <th>Base</th>
                                  <th>Customer Fee</th>
                                  <th>Merchant Fee</th>
                                  <th>Net</th>
                                  <th>From Merchant</th>
                                  <th>To Customer</th>
                                </tr>
                              </thead>
                              <tbody>
                                <For each={cashEntries()}>
                                  {(e) => (
                                    <tr class="cashRowClickable" onClick={() => openCashEdit(e)}>
                                      <td>{e.transactionDate.slice(0, 19).replace("T", " ")}</td>
                                      <td>{e.cashType === "CASH_IN" ? "Cash In" : "Cash Out"}</td>
                                      <td>{formatCashRecordStatus(e.status)}</td>
                                      <td>{e.orderNumber}</td>
                                      <td>{e.partner.name}</td>
                                      <td>{e.merchant.name}</td>
                                      <td>{formatIdr(e.totalAmount)}</td>
                                      <td>{formatIdr(e.grossFeeAmount)}</td>
                                      <td>{formatIdr(e.merchantFeeAmount)}</td>
                                      <td>{formatIdr(e.netProfit)}</td>
                                      <td>{formatIdr(e.receiveFromMerchantAmount)}</td>
                                      <td>{formatIdr(e.payToCustomerAmount)}</td>
                                    </tr>
                                  )}
                                </For>
                              </tbody>
                            </table>
                          </div>
                        </Show>
                      </Show>
                    </div>
                  </div>
                </Show>

                <Show when={menuSection() === "PAYMENTS"}>
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
                    when={!loading() || paymentMerchants().length > 0}
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
                            <div class="categoryBlock">
                              <div class="categoryHeaderRow">
                                <div class="categoryTitle">{cat.category}</div>
                                <div class="categoryMeta">{cat.merchants.length} merchants</div>
                              </div>
                              <div class="categoryGrid">
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
                                        class="merchantCard"
                                        type="button"
                                        onClick={() => {
                                          setSelectedMerchant(m);
                                          setTab("LINK");
                                        }}
                                      >
                                        <div class="merchantCardInner">
                                          <div class="merchantCardTop">
                                            <img
                                              class="merchantAvatar"
                                              src={m.pictureUrl ?? defaultMerchantImage(m.name)}
                                              alt=""
                                              onError={(e) => {
                                                const img = e.currentTarget;
                                                if (img.dataset.fallback === "1") return;
                                                img.dataset.fallback = "1";
                                                img.src = defaultMerchantImage(m.name);
                                              }}
                                            />
                                            <div class="merchantMeta">
                                              <div class="merchantName">{m.name}</div>
                                              <div class="merchantTagRow">
                                                <span class="merchantTag">{m.category}</span>
                                                {sum().active > 0 ? (
                                                  <span class="merchantTag merchantTagActive">
                                                    Active {sum().active}
                                                  </span>
                                                ) : null}
                                              </div>
                                            </div>
                                            <div class="merchantChevron">›</div>
                                          </div>
                                          <div class="merchantStats">
                                            <div class="merchantStat">
                                              <div class="merchantStatLabel">Link/s</div>
                                              <div class="merchantStatValue">{sum().links}</div>
                                            </div>
                                            <div class="merchantStat">
                                              <div class="merchantStatLabel">QRIS</div>
                                              <div class="merchantStatValue">{sum().qris}</div>
                                            </div>
                                          </div>
                                        </div>
                                      </button>
                                    );
                                  }}
                                </For>
                              </div>
                              <Show
                                when={cat.merchants.length > visibleMerchantsCount(cat.category)}
                              >
                                <div style="margin-top: 12px">
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
                                  class="merchantCard"
                                  type="button"
                                  onClick={() => {
                                    setSelectedMerchant(m);
                                    setTab("LINK");
                                  }}
                                >
                                  <div class="merchantCardInner">
                                    <div class="merchantCardTop">
                                      <img
                                        class="merchantAvatar"
                                        src={m.pictureUrl ?? defaultMerchantImage(m.name)}
                                        alt=""
                                        onError={(e) => {
                                          const img = e.currentTarget;
                                          if (img.dataset.fallback === "1") return;
                                          img.dataset.fallback = "1";
                                          img.src = defaultMerchantImage(m.name);
                                        }}
                                      />
                                      <div class="merchantMeta">
                                        <div class="merchantName">{m.name}</div>
                                        <div class="merchantTagRow">
                                          <span class="merchantTag">{m.category}</span>
                                          {sum().active > 0 ? (
                                            <span class="merchantTag merchantTagActive">
                                              Active {sum().active}
                                            </span>
                                          ) : null}
                                        </div>
                                      </div>
                                      <div class="merchantChevron">›</div>
                                    </div>
                                    <div class="merchantStats">
                                      <div class="merchantStat">
                                        <div class="merchantStatLabel">Link/s</div>
                                        <div class="merchantStatValue">{sum().links}</div>
                                      </div>
                                      <div class="merchantStat">
                                        <div class="merchantStatLabel">QRIS</div>
                                        <div class="merchantStatValue">{sum().qris}</div>
                                      </div>
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
                                <div style="border: 1px solid var(--line); border-radius: 18px; padding: 12px; display: grid; gap: 10px">
                                  <div style="display: flex; gap: 10px; align-items: baseline; justify-content: space-between; flex-wrap: wrap">
                                    <div style="color: var(--ink); font-size: 16px; font-weight: 750; letter-spacing: -0.02em">
                                      {formatIdr(it.totalAmount)}
                                    </div>
                                    <div style="color: var(--muted); font-size: 13px">
                                      {formatCountdown(it.expiresAt)}
                                    </div>
                                  </div>
                                  <div style="color: var(--muted); font-size: 13px; line-height: 1.4">
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
                                      style="width: 100%; max-height: 420px; object-fit: contain; border-radius: 16px; border: 1px solid var(--line)"
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
                </Show>
              </div>
            </div>

            <Show when={!readOnly() && menuSection() === "PAYMENTS"}>
              <div style="grid-column: span 4; display: grid; gap: 16px">
                <div class="card">
                  <div class="cardInner" style="display: grid; gap: 12px">
                    <div style="font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted)">
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
                        placeholder="e.g. E-commerce"
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
                      <div style="font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted)">
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
                          placeholder="e.g. Shopee"
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
                      <div style="font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted)">
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
                          when={!loading() || paymentMerchants().length > 0}
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
                            <For each={paymentMerchants()}>
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

            <Show when={!readOnly() && menuSection() === "CASH"}>
              <div class="cashSide">
                <div class="card">
                  <div class="cardInner" style="display: grid; gap: 12px">
                    <div style="font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted)">
                      Register Merchant
                    </div>
                    <div class="field">
                      <label for="cash_add_merchant">
                        Merchant Name<span class="fieldReq">*</span>
                      </label>
                      <input
                        id="cash_add_merchant"
                        value={newCashMerchantName()}
                        onInput={(e) => setNewCashMerchantName(e.currentTarget.value)}
                        placeholder="e.g. Cuan Yuk!"
                      />
                    </div>
                    <button
                      class="btn btnPrimary"
                      type="button"
                      disabled={newCashMerchantName().trim().length < 2 || Boolean(cashMutating())}
                      onClick={() => void addCashMerchant()}
                    >
                      <span style="display: inline-flex; gap: 10px; align-items: center">
                        {cashMutating() === "add_merchant" ? <span class="spinner" /> : null}
                        <span>{cashMutating() === "add_merchant" ? "Submitting…" : "Submit"}</span>
                      </span>
                    </button>
                  </div>
                </div>

                <Show when={showCashPartnerSection()}>
                  <div class="card">
                    <div class="cardInner" style="display: grid; gap: 12px">
                      <div style="font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted)">
                        Register Partner
                      </div>
                      <div class="field">
                        <label for="cash_add_partner">
                          Partner Name<span class="fieldReq">*</span>
                        </label>
                        <input
                          id="cash_add_partner"
                          value={newCashPartnerName()}
                          onInput={(e) => setNewCashPartnerName(e.currentTarget.value)}
                          placeholder="e.g. John Doe"
                        />
                      </div>
                      <button
                        class="btn btnPrimary"
                        type="button"
                        disabled={newCashPartnerName().trim().length < 2 || Boolean(cashMutating())}
                        onClick={() => void addCashPartner()}
                      >
                        <span style="display: inline-flex; gap: 10px; align-items: center">
                          {cashMutating() === "add_partner" ? <span class="spinner" /> : null}
                          <span>{cashMutating() === "add_partner" ? "Submitting…" : "Submit"}</span>
                        </span>
                      </button>
                    </div>
                  </div>
                </Show>

                <Show when={showCashRecordSection()}>
                  <div class="card">
                    <div class="cardInner" style="display: grid; gap: 12px">
                      <div style="font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted)">
                        Add Cash Record
                      </div>

                      <div class="field">
                        <label for="cash_tx_type">
                          Cash Flow Type<span class="fieldReq">*</span>
                        </label>
                        <select
                          id="cash_tx_type"
                          class="select"
                          value={cashTxCashType()}
                          onChange={(e) =>
                            setCashTxCashType(e.currentTarget.value as "CASH_IN" | "CASH_OUT")
                          }
                        >
                          <option value="CASH_IN">Cash In</option>
                          <option value="CASH_OUT">Cash Out</option>
                        </select>
                      </div>

                      <div class="field">
                        <label for="cash_tx_status">
                          Status<span class="fieldReq">*</span>
                        </label>
                        <select
                          id="cash_tx_status"
                          class="select"
                          value={cashTxStatus()}
                          onChange={(e) =>
                            setCashTxStatus(e.currentTarget.value as "PENDING" | "ACTIVE")
                          }
                        >
                          <option value="PENDING">Pending</option>
                          <option value="ACTIVE">Success</option>
                        </select>
                      </div>

                      <div class="field">
                        <label for="cash_tx_date">
                          Transaction Date<span class="fieldReq">*</span>
                        </label>
                        <DateTimePicker
                          id="cash_tx_date"
                          value={cashTxDate}
                          onChange={setCashTxDate}
                          disabled={Boolean(cashMutating())}
                        />
                      </div>

                      <div class="field">
                        <label for="cash_tx_order">
                          Order Number<span class="fieldReq">*</span>
                        </label>
                        <input
                          id="cash_tx_order"
                          value={cashTxOrderNumber()}
                          onInput={(e) => setCashTxOrderNumber(e.currentTarget.value)}
                          placeholder="e.g. ORD-2026-0001"
                        />
                      </div>

                      <div class="field">
                        <label for="cash_tx_total">
                          Base Total (IDR)<span class="fieldReq">*</span>
                        </label>
                        <input
                          id="cash_tx_total"
                          inputmode="numeric"
                          value={cashTxTotalAmount()}
                          onInput={(e) => setCashTxTotalAmount(e.currentTarget.value)}
                          placeholder="e.g. 10000000"
                        />
                      </div>

                      <div class="field">
                        <label for="cash_tx_merchant">
                          Merchant<span class="fieldReq">*</span>
                        </label>
                        <select
                          id="cash_tx_merchant"
                          class="select"
                          value={cashTxMerchantId()}
                          onChange={(e) => setCashTxMerchantId(e.currentTarget.value)}
                          disabled={cashMerchants().length === 0}
                        >
                          <For each={cashMerchants()}>
                            {(m) => <option value={m.id}>{m.name}</option>}
                          </For>
                        </select>
                      </div>

                      <div class="field">
                        <label for="cash_tx_partner">
                          Partner<span class="fieldReq">*</span>
                        </label>
                        <select
                          id="cash_tx_partner"
                          class="select"
                          value={cashTxPartnerId()}
                          onChange={(e) => setCashTxPartnerId(e.currentTarget.value)}
                          disabled={cashPartners().length === 0}
                        >
                          <For each={cashPartners()}>
                            {(p) => <option value={p.id}>{p.name}</option>}
                          </For>
                        </select>
                      </div>

                      <div class="field">
                        <label for="cash_tx_customer_fee">
                          Customer Fee (% of base)<span class="fieldReq">*</span>
                        </label>
                        <div class="suffixField">
                          <input
                            id="cash_tx_customer_fee"
                            type="number"
                            inputmode="decimal"
                            step="0.01"
                            min="0"
                            max="100"
                            value={cashTxCustomerFeePercent()}
                            onInput={(e) => setCashTxCustomerFeePercent(e.currentTarget.value)}
                            placeholder="10"
                          />
                          <span class="suffixFieldText">%</span>
                        </div>
                      </div>
                      <div class="field">
                        <label for="cash_tx_merchant_fee">
                          Merchant Fee (% of base)<span class="fieldReq">*</span>
                        </label>
                        <div class="suffixField">
                          <input
                            id="cash_tx_merchant_fee"
                            type="number"
                            inputmode="decimal"
                            step="0.01"
                            min="0"
                            max="100"
                            value={cashTxMerchantFeePercent()}
                            onInput={(e) => setCashTxMerchantFeePercent(e.currentTarget.value)}
                            placeholder="10"
                          />
                          <span class="suffixFieldText">%</span>
                        </div>
                      </div>

                      <div class="cashCalcNote">Fee breakdown (calculated from Base Total)</div>
                      <div class="cashBreakdownGrid">
                        <div class="cashCalcCard">
                          <div class="cashCalcLabel">Base Total</div>
                          <div class="cashCalcValue">{formatMaybeIdr(cashBaseAmountValue())}</div>
                        </div>
                        <div class="cashCalcCard">
                          <div class="cashCalcLabel">Merchant Fee %</div>
                          <div class="cashCalcValue">
                            {formatMaybePercent(cashMerchantFeePercentValue())}
                          </div>
                        </div>
                        <div class="cashCalcCard">
                          <div class="cashCalcLabel">Merchant Fee (IDR)</div>
                          <div class="cashCalcValue">{formatMaybeIdr(cashMerchantFeeAmount())}</div>
                        </div>
                        <div class="cashCalcCard">
                          <div class="cashCalcLabel">From Merchant</div>
                          <div class="cashCalcValue">
                            {formatMaybeIdr(cashReceiveFromMerchantAmount())}
                          </div>
                        </div>
                        <div class="cashCalcCard">
                          <div class="cashCalcLabel">Customer Fee %</div>
                          <div class="cashCalcValue">
                            {formatMaybePercent(cashCustomerFeePercentValue())}
                          </div>
                        </div>
                        <div class="cashCalcCard">
                          <div class="cashCalcLabel">Customer Fee (IDR)</div>
                          <div class="cashCalcValue">{formatMaybeIdr(cashGrossFeeAmount())}</div>
                        </div>
                        <div class="cashCalcCard">
                          <div class="cashCalcLabel">To Customer</div>
                          <div class="cashCalcValue">
                            {formatMaybeIdr(cashPayToCustomerAmount())}
                          </div>
                        </div>
                        <div class="cashCalcCard">
                          <div class="cashCalcLabel">Profit</div>
                          <div class="cashCalcValue">{formatMaybeIdr(cashNetProfitAmount())}</div>
                        </div>
                      </div>
                      <Show when={cashNetProfitIsNegative()}>
                        <div class="fieldError">
                          Net profit is negative (merchant fee is larger than total fees).
                        </div>
                      </Show>

                      <button
                        class="btn btnPrimary"
                        type="button"
                        disabled={Boolean(cashMutating())}
                        onClick={() => void addCashTransaction()}
                      >
                        <span style="display: inline-flex; gap: 10px; align-items: center">
                          {cashMutating() === "add_tx" ? <span class="spinner" /> : null}
                          <span>{cashMutating() === "add_tx" ? "Submitting…" : "Submit"}</span>
                        </span>
                      </button>
                    </div>
                  </div>
                </Show>
              </div>
            </Show>
          </div>

          <Modal
            open={cashEditOpen()}
            onClose={() => {
              setCashEditOpen(false);
              setCashEditId(null);
            }}
          >
            <div style="display: grid; gap: 14px">
              <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap">
                <div>
                  <div style="font-weight: 800; letter-spacing: -0.02em; font-size: 20px">
                    Edit Cash Record
                  </div>
                  <div style="color: var(--muted); font-size: 13px; margin-top: 2px">
                    Update the selected cash transaction.
                  </div>
                </div>
                <button
                  class="btn"
                  type="button"
                  onClick={() => {
                    setCashEditOpen(false);
                    setCashEditId(null);
                  }}
                >
                  Close
                </button>
              </div>

              <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px">
                <div class="field" style="margin: 0">
                  <label for="cash_edit_type">
                    Cash Flow Type<span class="fieldReq">*</span>
                  </label>
                  <select
                    id="cash_edit_type"
                    class="select"
                    value={cashEditCashType()}
                    onChange={(e) =>
                      setCashEditCashType(e.currentTarget.value as "CASH_IN" | "CASH_OUT")
                    }
                    disabled={Boolean(cashMutating())}
                  >
                    <option value="CASH_IN">Cash In</option>
                    <option value="CASH_OUT">Cash Out</option>
                  </select>
                </div>

                <div class="field" style="margin: 0">
                  <label for="cash_edit_status">
                    Status<span class="fieldReq">*</span>
                  </label>
                  <select
                    id="cash_edit_status"
                    class="select"
                    value={cashEditStatus()}
                    onChange={(e) =>
                      setCashEditStatus(e.currentTarget.value as "PENDING" | "ACTIVE")
                    }
                    disabled={Boolean(cashMutating())}
                  >
                    <option value="PENDING">Pending</option>
                    <option value="ACTIVE">Success</option>
                  </select>
                </div>
              </div>

              <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px">
                <div class="field" style="margin: 0">
                  <label for="cash_edit_date">
                    Transaction Date<span class="fieldReq">*</span>
                  </label>
                  <DateTimePicker
                    id="cash_edit_date"
                    value={cashEditDate}
                    onChange={setCashEditDate}
                    disabled={Boolean(cashMutating())}
                  />
                </div>

                <div class="field" style="margin: 0">
                  <label for="cash_edit_order">
                    Order Number<span class="fieldReq">*</span>
                  </label>
                  <input
                    id="cash_edit_order"
                    value={cashEditOrderNumber()}
                    onInput={(e) => setCashEditOrderNumber(e.currentTarget.value)}
                    disabled={Boolean(cashMutating())}
                  />
                </div>
              </div>

              <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px">
                <div class="field" style="margin: 0">
                  <label for="cash_edit_total">
                    Base Total (IDR)<span class="fieldReq">*</span>
                  </label>
                  <input
                    id="cash_edit_total"
                    inputmode="numeric"
                    value={cashEditTotalAmount()}
                    onInput={(e) => setCashEditTotalAmount(e.currentTarget.value)}
                    disabled={Boolean(cashMutating())}
                  />
                </div>

                <div class="field" style="margin: 0">
                  <label for="cash_edit_customer_fee">
                    Customer Fee (% of base)<span class="fieldReq">*</span>
                  </label>
                  <div class="suffixField">
                    <input
                      id="cash_edit_customer_fee"
                      type="number"
                      inputmode="decimal"
                      step="0.01"
                      min="0"
                      max="100"
                      value={cashEditCustomerFeePercent()}
                      onInput={(e) => setCashEditCustomerFeePercent(e.currentTarget.value)}
                      disabled={Boolean(cashMutating())}
                    />
                    <span class="suffixFieldText">%</span>
                  </div>
                </div>
              </div>

              <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px">
                <div class="field" style="margin: 0">
                  <label for="cash_edit_merchant_fee">
                    Merchant Fee (% of base)<span class="fieldReq">*</span>
                  </label>
                  <div class="suffixField">
                    <input
                      id="cash_edit_merchant_fee"
                      type="number"
                      inputmode="decimal"
                      step="0.01"
                      min="0"
                      max="100"
                      value={cashEditMerchantFeePercent()}
                      onInput={(e) => setCashEditMerchantFeePercent(e.currentTarget.value)}
                      disabled={Boolean(cashMutating())}
                    />
                    <span class="suffixFieldText">%</span>
                  </div>
                </div>

                <div class="field" style="margin: 0">
                  <label for="cash_edit_merchant">
                    Merchant<span class="fieldReq">*</span>
                  </label>
                  <select
                    id="cash_edit_merchant"
                    class="select"
                    value={cashEditMerchantId()}
                    onChange={(e) => setCashEditMerchantId(e.currentTarget.value)}
                    disabled={Boolean(cashMutating())}
                  >
                    <For each={cashMerchants()}>
                      {(m) => <option value={m.id}>{m.name}</option>}
                    </For>
                  </select>
                </div>
              </div>

              <div class="field" style="margin: 0">
                <label for="cash_edit_partner">
                  Partner<span class="fieldReq">*</span>
                </label>
                <select
                  id="cash_edit_partner"
                  class="select"
                  value={cashEditPartnerId()}
                  onChange={(e) => setCashEditPartnerId(e.currentTarget.value)}
                  disabled={Boolean(cashMutating())}
                >
                  <For each={cashPartners()}>{(p) => <option value={p.id}>{p.name}</option>}</For>
                </select>
              </div>

              <div class="cashCalcNote">Fee breakdown (calculated from Base Total)</div>
              <div class="cashBreakdownGrid">
                <div class="cashCalcCard">
                  <div class="cashCalcLabel">Base Total</div>
                  <div class="cashCalcValue">{formatMaybeIdr(cashEditBaseAmountValue())}</div>
                </div>
                <div class="cashCalcCard">
                  <div class="cashCalcLabel">Merchant Fee %</div>
                  <div class="cashCalcValue">
                    {formatMaybePercent(cashEditMerchantFeePercentValue())}
                  </div>
                </div>
                <div class="cashCalcCard">
                  <div class="cashCalcLabel">Merchant Fee (IDR)</div>
                  <div class="cashCalcValue">{formatMaybeIdr(cashEditMerchantFeeAmount())}</div>
                </div>
                <div class="cashCalcCard">
                  <div class="cashCalcLabel">From Merchant</div>
                  <div class="cashCalcValue">
                    {formatMaybeIdr(cashEditReceiveFromMerchantAmount())}
                  </div>
                </div>
                <div class="cashCalcCard">
                  <div class="cashCalcLabel">Customer Fee %</div>
                  <div class="cashCalcValue">
                    {formatMaybePercent(cashEditCustomerFeePercentValue())}
                  </div>
                </div>
                <div class="cashCalcCard">
                  <div class="cashCalcLabel">Customer Fee (IDR)</div>
                  <div class="cashCalcValue">{formatMaybeIdr(cashEditGrossFeeAmount())}</div>
                </div>
                <div class="cashCalcCard">
                  <div class="cashCalcLabel">To Customer</div>
                  <div class="cashCalcValue">{formatMaybeIdr(cashEditPayToCustomerAmount())}</div>
                </div>
                <div class="cashCalcCard">
                  <div class="cashCalcLabel">Profit</div>
                  <div class="cashCalcValue">{formatMaybeIdr(cashEditNetProfitAmount())}</div>
                </div>
              </div>

              <div style="display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap">
                <button
                  class="btn"
                  type="button"
                  onClick={() => {
                    setCashEditOpen(false);
                    setCashEditId(null);
                  }}
                  disabled={Boolean(cashMutating())}
                >
                  Cancel
                </button>
                <button
                  class="btn btnPrimary"
                  type="button"
                  onClick={() => void saveCashEdit()}
                  disabled={Boolean(cashMutating())}
                >
                  <span style="display: inline-flex; gap: 10px; align-items: center">
                    {cashMutating() === "edit_tx" ? <span class="spinner" /> : null}
                    <span>{cashMutating() === "edit_tx" ? "Saving…" : "Save"}</span>
                  </span>
                </button>
              </div>
            </div>
          </Modal>

          <Modal open={cashAdvancedOpen()} onClose={() => setCashAdvancedOpen(false)}>
            <div style="display: grid; gap: 14px">
              <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap">
                <div>
                  <div style="font-weight: 800; letter-spacing: -0.02em; font-size: 20px">
                    Advanced Filters
                  </div>
                  <div style="color: var(--muted); font-size: 13px; margin-top: 2px">
                    Filter by partner name and/or merchant name.
                  </div>
                </div>
                <button class="btn" type="button" onClick={() => setCashAdvancedOpen(false)}>
                  Close
                </button>
              </div>

              <div class="field">
                <label for="cash_adv_partner">Partner Name</label>
                <input
                  id="cash_adv_partner"
                  value={cashAdvPartnerName()}
                  onInput={(e) => setCashAdvPartnerName(e.currentTarget.value)}
                  placeholder="e.g. BCA, Dana, etc."
                />
              </div>
              <div class="field">
                <label for="cash_adv_merchant">Merchant Name</label>
                <input
                  id="cash_adv_merchant"
                  value={cashAdvMerchantName()}
                  onInput={(e) => setCashAdvMerchantName(e.currentTarget.value)}
                  placeholder="e.g. Warung Sate Pak Dimas"
                />
              </div>

              <div style="display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap">
                <button
                  class="btn"
                  type="button"
                  onClick={() => {
                    setCashAdvPartnerName("");
                    setCashAdvMerchantName("");
                  }}
                >
                  Clear
                </button>
                <button
                  class="btn btnPrimary"
                  type="button"
                  onClick={() => {
                    setCashAdvancedOpen(false);
                    setCashPage(1);
                    void refreshCashAll({ showSpinner: true });
                  }}
                >
                  Apply
                </button>
              </div>
            </div>
          </Modal>

          <Modal open={Boolean(selectedMerchant())} onClose={() => setSelectedMerchant(null)}>
            <Show when={selectedMerchant()}>
              {(m) => (
                <div style="display: grid; gap: 14px">
                  <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap">
                    <div>
                      <div style="font-weight: 700; letter-spacing: -0.02em; font-size: 20px">
                        {m().name}
                      </div>
                      <div style="color: var(--muted); font-size: 13px; margin-top: 2px">
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
                            <div style="border: 1px solid var(--line); border-radius: 18px; padding: 12px; display: grid; gap: 10px">
                              <div style="display: flex; gap: 10px; align-items: baseline; justify-content: space-between; flex-wrap: wrap">
                                <div style="color: var(--ink); font-size: 16px; font-weight: 750; letter-spacing: -0.02em">
                                  {formatIdr(it.totalAmount)}
                                </div>
                                <div style="color: var(--muted); font-size: 13px">
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
                                  style="width: 100%; max-height: 420px; object-fit: contain; border-radius: 16px; border: 1px solid var(--line)"
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
