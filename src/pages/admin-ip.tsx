import { useNavigate } from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { Toast, type ToastState } from "../components/toast";
import { useAuth } from "../state/auth";
import { api } from "../utils/api";

type IpEntry = { id: string; ip: string; note: string | null; status: "ACTIVE" | "INACTIVE" | "PENDING" | "DELETED" };

export default function AdminIp() {
  const auth = useAuth();
  const navigate = useNavigate();

  const [entries, setEntries] = createSignal<IpEntry[]>([]);
  const [ip, setIp] = createSignal("");
  const [note, setNote] = createSignal("");
  const [status, setStatus] = createSignal<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [saving, setSaving] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [statusFilter, setStatusFilter] = createSignal<"ALL" | "WHITELIST" | "BACKLIST">("ALL");
  const [page, setPage] = createSignal(1);
  const [toast, setToast] = createSignal<ToastState>(null);
  let toastTimer: number | null = null;

  const closeToast = () => {
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = null;
    setToast(null);
  };

  const showToast = (kind: NonNullable<ToastState>["kind"], message: string) => {
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = null;
    setToast({ id: Date.now(), kind, message });
    toastTimer = window.setTimeout(() => setToast(null), 5000);
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ entries: IpEntry[] }>("/admin/ips");
      setEntries(res.entries ?? []);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "LOAD_FAILED");
    } finally {
      setLoading(false);
    }
  };

  const filtered = createMemo(() => {
    const q = query().trim().toLowerCase();
    const f = statusFilter();
    return entries().filter((e) => {
      const statusOk =
        f === "ALL" ? true : f === "WHITELIST" ? e.status === "ACTIVE" : f === "BACKLIST" ? e.status === "INACTIVE" : true;
      if (!statusOk) return false;
      if (!q) return true;
      const noteText = (e.note ?? "").toLowerCase();
      return e.ip.toLowerCase().includes(q) || noteText.includes(q);
    });
  });

  const pageSize = 10;
  const totalPages = createMemo(() => Math.max(1, Math.ceil(filtered().length / pageSize)));
  createEffect(() => {
    const p = page();
    const tp = totalPages();
    if (p > tp) setPage(tp);
    if (p < 1) setPage(1);
  });
  const paged = createMemo(() => {
    const start = (page() - 1) * pageSize;
    return filtered().slice(start, start + pageSize);
  });

  createEffect(() => {
    const me = auth.me();
    if (auth.loading()) return;
    if (!me) {
      navigate("/sign-in", { replace: true });
      return;
    }
    if (me.role !== "SUPER") {
      navigate("/", { replace: true });
      return;
    }
    void refresh();
    const id = window.setInterval(() => {
      if (loading() || saving()) return;
      void refresh();
    }, 10000);
    return () => window.clearInterval(id);
  });

  const save = async () => {
    const ipVal = ip().trim();
    if (!ipVal) return;
    setSaving(true);
    showToast("progress", "Submitting…");
    try {
      await api.post("/admin/ips", { ip: ipVal, status: status(), note: note().trim() || undefined });
      showToast("success", "Submitted.");
      setIp("");
      setNote("");
      setStatus("ACTIVE");
      await refresh();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "SAVE_FAILED");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="shell" style="place-items: start center">
      <div class="panel">
        <div class="panelInner">
          <div class="title">
            <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap">
              <button class="btn" type="button" onClick={() => navigate("/")} disabled={saving() || loading()}>
                Back
              </button>
              <h1 style="margin: 0">IP Access Control</h1>
            </div>
          </div>

          <div class="grid">
            <div class="card" style="grid-column: span 5">
              <div class="cardInner" style="display: grid; gap: 12px">
                <div style="font-weight: 650; letter-spacing: -0.01em">Add / Update IP</div>
                <div class="field">
                  <label>IP Address</label>
                  <input value={ip()} onInput={(e) => setIp(e.currentTarget.value)} placeholder="e.g. 203.0.113.10" />
                </div>
                <div class="field">
                  <label>Status</label>
                  <select class="select" value={status()} onChange={(e) => setStatus(e.currentTarget.value as "ACTIVE" | "INACTIVE")}>
                    <option value="ACTIVE">Whitelist</option>
                    <option value="INACTIVE">Blacklist</option>
                  </select>
                </div>
                <div class="field">
                  <label>Remarks</label>
                  <input value={note()} onInput={(e) => setNote(e.currentTarget.value)} placeholder="e.g. Office Wi‑Fi" />
                </div>
                <button class="btn btnPrimary" disabled={saving() || ip().trim().length < 3} onClick={() => void save()}>
                  <span style="display: inline-flex; gap: 10px; align-items: center">
                    {saving() ? <span class="spinner" /> : null}
                    <span>{saving() ? "Submitting…" : "Submit"}</span>
                  </span>
                </button>
              </div>
            </div>

            <div class="card" style="grid-column: span 7">
              <div class="cardInner" style="display: grid; gap: 12px">
                <div style="display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap">
                  <div style="font-weight: 650; letter-spacing: -0.01em">IP Lists</div>
                  <button class="btn" disabled={loading()} onClick={() => void refresh()}>
                    <span style="display: inline-flex; gap: 10px; align-items: center">
                      {loading() ? <span class="spinner" /> : null}
                      {!loading() ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                          <path d="M21 3v6h-6" />
                        </svg>
                      ) : null}
                      <span>{loading() ? "Loading…" : "Refresh"}</span>
                    </span>
                  </button>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 180px; gap: 10px">
                  <div class="field" style="margin: 0">
                    <label>Search</label>
                    <input value={query()} onInput={(e) => setQuery(e.currentTarget.value)} placeholder="Search IP or remarks" />
                  </div>
                  <div class="field" style="margin: 0">
                    <label>Status</label>
                    <select
                      class="select"
                      value={statusFilter()}
                      onChange={(e) => setStatusFilter(e.currentTarget.value as "ALL" | "WHITELIST" | "BACKLIST")}
                    >
                      <option value="ALL">All</option>
                      <option value="WHITELIST">Whitelist</option>
                      <option value="BACKLIST">Blacklist</option>
                    </select>
                  </div>
                </div>

                <Show
                  when={filtered().length}
                  fallback={
                    loading() ? (
                      <div style="display: grid; gap: 10px">
                        <For each={[1, 2, 3, 4, 5, 6]}>
                          {() => (
                            <div class="card" style="padding: 0">
                              <div class="cardInner" style="display: grid; gap: 10px">
                                <div style="display: flex; gap: 10px; align-items: baseline; justify-content: space-between">
                                  <div class="skeleton" style="height: 14px; width: 46%; border-radius: 10px" />
                                  <div class="skeleton" style="height: 22px; width: 92px; border-radius: 999px" />
                                </div>
                                <div class="skeleton" style="height: 12px; width: 62%; border-radius: 10px" />
                                <div style="display: flex; gap: 10px; flex-wrap: wrap">
                                  <div class="skeleton" style="height: 38px; width: 92px; border-radius: 14px" />
                                  <div class="skeleton" style="height: 38px; width: 110px; border-radius: 14px" />
                                </div>
                              </div>
                            </div>
                          )}
                        </For>
                      </div>
                    ) : (
                      <div style="color: rgba(250,250,255,0.7)">No matches.</div>
                    )
                  }
                >
                  <div class="ipListScroll">
                    <div style="display: grid; gap: 10px">
                      <For each={paged()}>
                      {(e) => (
                        <div
                          style="border: 1px solid rgba(255,255,255,0.12); border-radius: 18px; padding: 12px; display: grid; gap: 8px"
                        >
                          <div style="display: flex; gap: 12px; align-items: baseline; justify-content: space-between; flex-wrap: wrap">
                            <div style="font-weight: 700; letter-spacing: -0.01em">{e.ip}</div>
                            <span class={`statusPill ${e.status === "ACTIVE" ? "statusActive" : "statusInactive"}`}>
                              {e.status === "ACTIVE" ? "Whitelist" : "Blacklist"}
                            </span>
                          </div>
                          <div style="color: rgba(250,250,255,0.68); font-size: 13px; line-height: 1.4">{e.note ?? "—"}</div>
                          <div style="display: flex; gap: 10px; flex-wrap: wrap">
                            <button
                              class="btn"
                              disabled={saving()}
                              onClick={() => {
                                setIp(e.ip);
                                setNote(e.note ?? "");
                                setStatus(e.status === "ACTIVE" ? "ACTIVE" : "INACTIVE");
                              }}
                            >
                              Edit
                            </button>
                            <button class="btn" disabled={saving()} onClick={() => void api.post("/admin/ips", { ip: e.ip, status: "ACTIVE", note: e.note ?? undefined }).then(refresh)}>
                              Whitelist
                            </button>
                            <button
                              class="btn"
                              disabled={saving()}
                              onClick={() => void api.post("/admin/ips", { ip: e.ip, status: "INACTIVE", note: e.note ?? undefined }).then(refresh)}
                            >
                              Blacklist
                            </button>
                          </div>
                        </div>
                      )}
                    </For>
                    </div>
                  </div>
                  <div style="display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap">
                    <div style="color: rgba(250,250,255,0.62); font-size: 13px">
                      Page {page()} of {totalPages()} • Showing {Math.min(pageSize, filtered().length - (page() - 1) * pageSize)} of {filtered().length}
                    </div>
                    <div style="display: flex; gap: 10px; align-items: center">
                      <button class="btn" disabled={page() <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                        Prev
                      </button>
                      <button class="btn" disabled={page() >= totalPages()} onClick={() => setPage((p) => Math.min(totalPages(), p + 1))}>
                        Next
                      </button>
                    </div>
                  </div>
                </Show>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Toast toast={toast()} onClose={closeToast} />
    </div>
  );
}
