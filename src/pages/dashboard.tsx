import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { api } from "../utils/api";
import { useAuth } from "../state/auth";
import { Modal } from "../components/modal";
import { Toast, type ToastState } from "../components/toast";

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

const wsBase = import.meta.env.VITE_WS_BASE_URL ?? "ws://localhost:3001";

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
    merchants: ms.sort((a, b) => a.name.localeCompare(b.name))
  }));
};

export default function Dashboard(props: any) {
  const auth = useAuth();
  const publicToken = (props as { publicToken?: string }).publicToken;
  const [merchants, setMerchants] = createSignal<Merchant[]>([]);
  const [items, setItems] = createSignal<PaymentItem[]>([]);
  const [notFound, setNotFound] = createSignal(false);
  const [selectedMerchant, setSelectedMerchant] = createSignal<Merchant | null>(null);
  const [tab, setTab] = createSignal<"LINK" | "QRIS">("LINK");

  const [newMerchantName, setNewMerchantName] = createSignal("");
  const [newMerchantCategory, setNewMerchantCategory] = createSignal("");
  const [newMerchantFile, setNewMerchantFile] = createSignal<File | null>(null);
  const [newCategoryName, setNewCategoryName] = createSignal("");
  const [categoriesList, setCategoriesList] = createSignal<{ id: string | null; name: string }[]>([]);
  const [postKind, setPostKind] = createSignal<"LINK" | "QRIS">("LINK");
  const [postMerchantId, setPostMerchantId] = createSignal<string>("");
  const [postExpiration, setPostExpiration] = createSignal<string>("");
  const [postLink, setPostLink] = createSignal<string>("");
  const [postQrisFile, setPostQrisFile] = createSignal<File | null>(null);
  const [postTotalAmount, setPostTotalAmount] = createSignal<string>("");
  const [toast, setToast] = createSignal<ToastState>(null);
  const [action, setAction] = createSignal<
    { kind: "add_category" | "add_merchant" | "post" | "deactivate" | "signout"; id?: string } | null
  >(null);
  const [loading, setLoading] = createSignal(false);
  const [syncing, setSyncing] = createSignal(false);
  let refreshInFlight: Promise<void> | null = null;
  let toastTimer: number | null = null;
  let qrisInputEl: HTMLInputElement | undefined;
  let merchantPicInputEl: HTMLInputElement | undefined;
  const [openItemId, setOpenItemId] = createSignal<string | null>(null);
  const [nowMs, setNowMs] = createSignal(Date.now());

  const readOnly = createMemo(() => Boolean(publicToken));
  createEffect(() => {
    try {
      document.title = readOnly() ? "CUAN YUK!" : "Dashboard";
    } catch {}
  });

  const closeToast = () => {
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = null;
    setToast(null);
  };

  const showToast = (kind: NonNullable<ToastState>["kind"], message: string) => {
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = null;
    setToast({ id: Date.now() + Math.floor(Math.random() * 1000), kind, message });
    toastTimer = window.setTimeout(() => setToast(null), 5000);
  };

  const isAction = (kind: NonNullable<ReturnType<typeof action>>["kind"], id?: string) => {
    const a = action();
    if (!a) return false;
    if (a.kind !== kind) return false;
    if (id && a.id !== id) return false;
    return true;
  };

  const formatIdr = (n: number) => {
    try {
      return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
    } catch {
      return `Rp ${n}`;
    }
  };

  createEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
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

  const fileToBase64 = async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  };

  const openUrl = (id: string, url: string) => {
    setOpenItemId(id);
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {}
    window.setTimeout(() => {
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
          `/public/dashboard/${encodeURIComponent(publicToken!)}`
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

      const [m, p, c] = await Promise.all([
        api.get<{ merchants: Merchant[] }>("/merchants/"),
        api.get<{ items: PaymentItem[] }>("/payments/active"),
        api.get<{ categories: { id: string | null; name: string }[] }>("/categories/")
      ]);
      setMerchants(m.merchants);
      setItems(p.items.filter((i) => i.status === "ACTIVE"));
      setCategoriesList(c.categories);
      if (!postMerchantId() && m.merchants.length) setPostMerchantId(m.merchants[0].id);
      if (!newMerchantCategory() && c.categories.length) setNewMerchantCategory(c.categories[0].name);
    } catch (e) {
      if (publicToken) {
        setNotFound(true);
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
        ? window.setTimeout(() => {
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
      if (guardId) window.clearTimeout(guardId);
      if (opts.showSkeleton) setLoading(false);
      if (opts.showSpinner) setSyncing(false);
    }
  };

  createEffect(() => {
    void refresh({ showSpinner: true, showSkeleton: true });
    const ws = new WebSocket(`${wsBase}/ws`);
    let pingTimer: number | null = null;
    let pollTimer: number | null = null;
    let lastSoftSyncAt = 0;
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
      pingTimer = window.setInterval(() => {
        try {
          ws.send(JSON.stringify({ type: "ping" }));
        } catch {}
      }, 10000);
    });
    ws.addEventListener("close", () => {
      if (pingTimer) window.clearInterval(pingTimer);
      pingTimer = null;
    });
    pollTimer = window.setInterval(() => {
      if (action()) return;
      const now = Date.now();
      if (now - lastSoftSyncAt < 10_000) return;
      lastSoftSyncAt = now;
      void refresh({ showSpinner: true, showSkeleton: false });
    }, 10000);
    return () => {
      if (pingTimer) window.clearInterval(pingTimer);
      pingTimer = null;
      if (pollTimer) window.clearInterval(pollTimer);
      pollTimer = null;
      ws.close();
    };
  });

  const categories = createMemo(() => groupByCategory(merchants()));

  const addMerchant = async () => {
    if (readOnly()) return;
    if (!newMerchantCategory().trim()) {
      showToast("error", "Create a category first.");
      return;
    }
    setAction({ kind: "add_merchant" });
    showToast("progress", "Adding merchant…");
    try {
      const imageBase64 = newMerchantFile() ? await fileToBase64(newMerchantFile()!) : undefined;
      await api.post("/merchants/", { name: newMerchantName(), category: newMerchantCategory(), imageBase64 });
      setNewMerchantName("");
      setNewMerchantFile(null);
      showToast("success", "Merchant added.");
      await refresh({ showSpinner: true, showSkeleton: false });
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "ADD_MERCHANT_FAILED");
    } finally {
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
    const amountRaw = postTotalAmount().replaceAll(/[^\d]/g, "");
    const amount = amountRaw ? Number(amountRaw) : NaN;
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
          expiration: postExpiration().trim() === "" ? undefined : postExpiration().trim()
        });
        setPostLink("");
        setPostExpiration("");
        setPostTotalAmount("");
        showToast("success", "Payment link posted.");
      } else {
        const f = postQrisFile();
        if (!f) throw new Error("Missing QRIS image.");
        const imageBase64 = await fileToBase64(f);
        await api.post("/payments/qris", {
          merchantId: postMerchantId(),
          imageBase64,
          totalAmount: amount,
          expiration: postExpiration().trim() === "" ? undefined : postExpiration().trim()
        });
        setPostQrisFile(null);
        setPostExpiration("");
        setPostTotalAmount("");
        showToast("success", "QRIS posted.");
      }
      await refresh({ showSpinner: true, showSkeleton: false });
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "POST_FAILED");
    } finally {
      setAction(null);
    }
  };

  const deactivate = async (id: string) => {
    if (readOnly()) return;
    setAction({ kind: "deactivate", id });
    showToast("progress", "Deactivating…");
    try {
      await api.postNoJson(`/payments/deactivate/${id}`, null);
      await refresh({ showSpinner: true, showSkeleton: false });
      showToast("success", "Deactivated.");
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
                This link doesn’t exist anymore (or it’s not available from your network). Ask the owner to generate a new one.
              </div>
              <a class="btn btnHero" href="/" style="width: min(320px, 100%); display: inline-flex; justify-content: center">
                Go Home
              </a>
            </div>
          </div>
        </div>
      </div>
    );

  return (
    <div class="shell" style="place-items: start center">
      <div class="panel">
        <div class="panelInner">
          <div style="display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap">
            <div class="title" style="margin: 0">
              <h1>{readOnly() ? "CUAN YUK!" : "Dashboard"}</h1>
            </div>
            <div style="display: flex; gap: 10px; align-items: center">
              <button
                class="btn"
                onClick={() => void refresh({ showSpinner: true, showSkeleton: false })}
                disabled={syncing() || Boolean(action())}
              >
                <span style="display: inline-flex; gap: 10px; align-items: center">
                  {syncing() ? <span class="spinner" /> : null}
                  {!syncing() ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                      <path d="M21 3v6h-6" />
                    </svg>
                  ) : null}
                  <span>{syncing() ? "Syncing…" : "Sync"}</span>
                </span>
              </button>
              <Show when={!readOnly() && isSuper()}>
                <button class="btn" type="button" onClick={() => (window.location.href = "/admin")}>
                  <span style="display: inline-flex; gap: 10px; align-items: center; font: inherit">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 1l9 4v6c0 5-3.8 9.8-9 12-5.2-2.2-9-7-9-12V5l9-4z" />
                      <path d="M9 12l2 2 4-4" />
                    </svg>
                    <span>Admin</span>
                  </span>
                </button>
              </Show>
              <Show when={!readOnly()}>
                <button class="btn" disabled={isAction("signout")} onClick={() => void signOut()}>
                  <span style="display: inline-flex; gap: 10px; align-items: center">
                    {isAction("signout") ? <span class="spinner" /> : null}
                    {!isAction("signout") ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <path d="M16 17l5-5-5-5" />
                        <path d="M21 12H9" />
                      </svg>
                    ) : null}
                    <span>{isAction("signout") ? "Signing Out…" : "Log Out"}</span>
                  </span>
                </button>
              </Show>
            </div>
          </div>

          <div class="grid" style="margin-top: 18px">
            <div class="card" style="grid-column: span 8">
              <div class="cardInner">
                <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap">
                  <div style="font-weight: 650; letter-spacing: -0.01em">Merchant Lists</div>
                  <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: baseline; color: rgba(250,250,255,0.62); font-size: 13px">
                    <div>Total Merchants: {merchants().length}</div>
                    <div>Total Payment Links: {totalLinks()}</div>
                    <div>Total QRIS: {totalQris()}</div>
                  </div>
                </div>

                <Show when={!readOnly() && shareUrl()}>
                  <div style="margin-top: 12px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap">
                    <div style="color: rgba(250,250,255,0.62); font-size: 13px">Share link:</div>
                    <button class="btn btnPrimary" type="button" onClick={() => openUrl("share-open", shareUrl()!)}>
                      <span style="display: inline-flex; gap: 10px; align-items: center">
                        {openItemId() === "share-open" ? <span class="spinner" /> : null}
                        <span>Open</span>
                      </span>
                    </button>
                    <button
                      class="btn btnPrimary"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(shareUrl()!);
                          showToast("success", "Link copied.");
                        } catch {
                          showToast("error", "COPY_FAILED");
                        }
                      }}
                    >
                      Copy
                    </button>
                  </div>
                </Show>

                <Show
                  when={!loading() || merchants().length > 0}
                  fallback={
                    <div
                      style={{
                        display: "grid",
                        "grid-template-columns": "repeat(12, 1fr)",
                        gap: "12px",
                        "margin-top": "14px"
                      }}
                    >
                      <For each={[1, 2, 3, 4, 5, 6, 7, 8, 9]}>
                        {() => (
                          <div class="card skeleton" style={{ "grid-column": "span 4", height: "92px" }}>
                            <div class="cardInner" />
                          </div>
                        )}
                      </For>
                    </div>
                  }
                >
                  <div style="display: grid; gap: 14px; margin-top: 14px">
                    <For each={categories()}>
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
                              "grid-template-columns": "repeat(12, 1fr)",
                              gap: "12px",
                              "margin-top": "10px"
                            }}
                          >
                            <For each={cat.merchants}>
                              {(m) => {
                                const sum = () => summaryByMerchant().get(m.id) ?? { links: 0, qris: 0, active: 0 };
                                return (
                                  <button
                                    class="card"
                                    style={{
                                      "grid-column": "span 4",
                                      cursor: "pointer",
                                      padding: "0",
                                      "text-align": "left"
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
                                          />
                                          <div style="font-weight: 700; letter-spacing: -0.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
                                            {m.name}
                                          </div>
                                        </div>
                                      </div>
                                      <div style="font-size: 13px; color: rgba(250,250,255,0.78); line-height: 1.4">
                                        {`${sum().links} links • ${sum().qris} QRIS`}
                                      </div>
                                    </div>
                                  </button>
                                );
                              }}
                            </For>
                          </div>
                        </div>
                      )}
                    </For>
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
                      <label>Name</label>
                      <input value={newCategoryName()} onInput={(e) => setNewCategoryName(e.currentTarget.value)} placeholder="e.g. Food" />
                    </div>
                    <button class="btn btnPrimary" disabled={newCategoryName().trim().length < 2 || Boolean(action())} onClick={() => void addCategory()}>
                      <span style="display: inline-flex; gap: 10px; align-items: center">
                        {isAction("add_category") ? <span class="spinner" /> : null}
                        <span>{isAction("add_category") ? "Submitting…" : "Submit"}</span>
                      </span>
                    </button>
                  </div>
                </div>

                <div class="card">
                  <div class="cardInner" style="display: grid; gap: 12px">
                    <div style="font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(250,250,255,0.62)">
                      Add Merchant
                    </div>
                    <div class="field">
                      <label>Name</label>
                      <input value={newMerchantName()} onInput={(e) => setNewMerchantName(e.currentTarget.value)} />
                    </div>
                    <div class="field">
                      <label>Category</label>
                      <select
                        class="select"
                        style="width: 100%"
                        value={newMerchantCategory()}
                        disabled={categoriesList().length === 0}
                        onChange={(e) => setNewMerchantCategory(e.currentTarget.value)}
                      >
                        <For each={categoriesList()}>{(c) => <option value={c.name}>{c.name}</option>}</For>
                      </select>
                    </div>
                    <div class="field">
                      <label style="display: none">Merchant Picture</label>
                      <input
                        ref={(el) => (merchantPicInputEl = el)}
                        type="file"
                        accept="image/*"
                        style="display: none"
                        onChange={(e) => setNewMerchantFile(e.currentTarget.files?.[0] ?? null)}
                      />
                      <div class="filePick">
                        <div class="filePickName">{newMerchantFile()?.name ?? "Drop your logo here"}</div>
                        <button class="filePickBtn" type="button" onClick={() => merchantPicInputEl?.click()}>
                          Choose File
                        </button>
                      </div>
                    </div>
                    <button
                      class="btn btnPrimary"
                      disabled={newMerchantName().trim().length < 2 || categoriesList().length === 0 || Boolean(action())}
                      onClick={() => void addMerchant()}
                    >
                      <span style="display: inline-flex; gap: 10px; align-items: center">
                        {isAction("add_merchant") ? <span class="spinner" /> : null}
                        <span>{isAction("add_merchant") ? "Submitting…" : "Submit"}</span>
                      </span>
                    </button>
                  </div>
                </div>

                <div class="card">
                  <div class="cardInner" style="display: grid; gap: 12px">
                    <div style="font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(250,250,255,0.62)">
                      Add Payment Link/QRIS
                    </div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap">
                      <button class={`btn ${postKind() === "LINK" ? "btnPrimary" : ""}`} onClick={() => setPostKind("LINK")}>
                        Payment Link
                      </button>
                      <button class={`btn ${postKind() === "QRIS" ? "btnPrimary" : ""}`} onClick={() => setPostKind("QRIS")}>
                        QRIS
                      </button>
                    </div>
                    <div class="field">
                      <label>Merchant</label>
                      <select class="select" style="width: 100%" value={postMerchantId()} onChange={(e) => setPostMerchantId(e.currentTarget.value)}>
                        <For each={merchants()}>{(m) => <option value={m.id}>{m.name}</option>}</For>
                      </select>
                    </div>
                    <div class="field">
                      <label>Expiration Time (default: 12H)</label>
                      <input
                        placeholder="12h / 5m / 1h / 1d / lifetime"
                        value={postExpiration()}
                        onInput={(e) => setPostExpiration(e.currentTarget.value)}
                      />
                    </div>
                    <div class="field">
                      <label>Payment Amount</label>
                      <input
                        inputmode="numeric"
                        value={postTotalAmount()}
                        onInput={(e) => setPostTotalAmount(e.currentTarget.value)}
                        placeholder="e.g. 150000"
                      />
                    </div>
                    <Show when={postKind() === "LINK"}>
                      <div class="field">
                        <label>Payment Link</label>
                        <input value={postLink()} onInput={(e) => setPostLink(e.currentTarget.value)} placeholder="https://…" />
                      </div>
                    </Show>
                    <Show when={postKind() === "QRIS"}>
                      <div class="field">
                        <label style="display: none">QRIS</label>
                        <input
                          ref={(el) => (qrisInputEl = el)}
                          type="file"
                          accept="image/*"
                          style="display: none"
                          onChange={(e) => setPostQrisFile(e.currentTarget.files?.[0] ?? null)}
                        />
                        <div class="filePick">
                          <div class="filePickName">{postQrisFile()?.name ?? "Drop your QRIS here"}</div>
                          <button class="filePickBtn" type="button" onClick={() => qrisInputEl?.click()}>
                            Choose File
                          </button>
                        </div>
                      </div>
                    </Show>
                    <button class="btn btnPrimary" disabled={Boolean(action())} onClick={() => void post()}>
                      <span style="display: inline-flex; gap: 10px; align-items: center">
                        {isAction("post") ? <span class="spinner" /> : null}
                        <span>{isAction("post") ? "Submitting…" : "Submit"}</span>
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </Show>
          </div>

          <Toast toast={toast()} onClose={closeToast} />

          <Modal open={Boolean(selectedMerchant())} onClose={() => setSelectedMerchant(null)}>
            <Show when={selectedMerchant()}>
              {(m) => (
                <div style="display: grid; gap: 14px">
                  <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap">
                    <div>
                      <div style="font-weight: 700; letter-spacing: -0.02em; font-size: 20px">{m().name}</div>
                      <div style="color: rgba(250,250,255,0.62); font-size: 13px; margin-top: 2px">{m().category}</div>
                    </div>
                    <button class="btn" onClick={() => setSelectedMerchant(null)}>
                      Close
                    </button>
                  </div>

                  <div style="display: flex; gap: 10px; flex-wrap: wrap">
                    <button class={`btn ${tab() === "LINK" ? "btnPrimary" : ""}`} onClick={() => setTab("LINK")}>
                      Payment Links
                    </button>
                    <button class={`btn ${tab() === "QRIS" ? "btnPrimary" : ""}`} onClick={() => setTab("QRIS")}>
                      QRIS
                    </button>
                  </div>

                  <Show
                    when={selectedItems().length}
                    fallback={
                      loading() ? (
                        <div
                          style={{
                            display: "grid",
                            gap: "12px",
                            "grid-template-columns": "repeat(auto-fit, minmax(240px, 1fr))"
                          }}
                        >
                          <For each={[1, 2, 3, 4, 5, 6]}>
                            {() => (
                              <div class="card skeleton" style={{ height: "160px" }}>
                                <div class="cardInner" />
                              </div>
                            )}
                          </For>
                        </div>
                      ) : (
                        <div class="emptyCenter">
                          <div class="emptyLogo">CY</div>
                          <div class="emptyTitle">No payments yet</div>
                          <div class="emptyText">Drop a payment link or QRIS and it’ll show up here.</div>
                        </div>
                      )
                    }
                  >
                    <div
                      style={{
                        display: "grid",
                        gap: "12px",
                        "grid-template-columns": "repeat(auto-fit, minmax(240px, 1fr))"
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
                                onClick={() => openUrl(`${it.id}:link`, it.paymentUrl!)}
                              >
                                <span style="display: inline-flex; gap: 10px; align-items: center">
                                  {openItemId() === `${it.id}:link` ? <span class="spinner" /> : null}
                                  <span>Open Payment Link</span>
                                </span>
                              </button>
                            </Show>
                            <Show when={it.kind === "QRIS" && it.qrisUrl}>
                              <img
                                src={it.qrisUrl!}
                                style="width: 100%; max-height: 420px; object-fit: contain; border-radius: 16px; border: 1px solid rgba(255,255,255,0.12)"
                              />
                              <button
                                class="btn btnWide"
                                type="button"
                                disabled={Boolean(action())}
                                onClick={() => openUrl(`${it.id}:qris`, it.qrisUrl!)}
                              >
                                <span style="display: inline-flex; gap: 10px; align-items: center">
                                  {openItemId() === `${it.id}:qris` ? <span class="spinner" /> : null}
                                  <span>Open QRIS Image</span>
                                </span>
                              </button>
                            </Show>
                            <Show when={!readOnly() && it.status === "ACTIVE"}>
                              <button class="btn btnWide" disabled={Boolean(action())} onClick={() => void deactivate(it.id)}>
                                <span style="display: inline-flex; gap: 10px; align-items: center">
                                  {isAction("deactivate", it.id) ? <span class="spinner" /> : null}
                                  <span>{isAction("deactivate", it.id) ? "Deactivating…" : "Deactivate"}</span>
                                </span>
                              </button>
                            </Show>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              )}
            </Show>
          </Modal>
        </div>
      </div>
    </div>
  );
}
