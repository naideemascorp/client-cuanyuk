import { useNavigate } from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { Toast, type ToastState } from "../components/toast";
import { useAuth } from "../state/auth";
import { api } from "../utils/api";

type IpEntry = { id: string; ip: string; note: string | null; status: "ACTIVE" | "INACTIVE" | "PENDING" | "DELETED" };
type UserEntry = {
  id: string;
  username: string;
  email: string;
  role: "USER" | "SUPER";
  status: "ACTIVE" | "INACTIVE" | "PENDING" | "DELETED";
  createdDate: string;
  updatedDate: string;
};

type Tab = "ips" | "users";

export default function Admin() {
  const auth = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = createSignal<Tab>("ips");
  const [toast, setToast] = createSignal<ToastState>(null);
  let toastTimer: number | null = null;

  const [ipEntries, setIpEntries] = createSignal<IpEntry[]>([]);
  const [ip, setIp] = createSignal("");
  const [ipNote, setIpNote] = createSignal("");
  const [ipStatus, setIpStatus] = createSignal<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [ipEditing, setIpEditing] = createSignal(false);
  const [ipSaving, setIpSaving] = createSignal(false);
  const [ipLoading, setIpLoading] = createSignal(false);
  const [ipQuery, setIpQuery] = createSignal("");
  const [ipStatusFilter, setIpStatusFilter] = createSignal<"ALL" | "WHITELIST" | "BACKLIST">("ALL");
  const [ipPage, setIpPage] = createSignal(1);

  const [users, setUsers] = createSignal<UserEntry[]>([]);
  const [userLoading, setUserLoading] = createSignal(false);
  const [userSaving, setUserSaving] = createSignal(false);
  const [userQuery, setUserQuery] = createSignal("");
  const [userStatusFilter, setUserStatusFilter] = createSignal<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [userRoleFilter, setUserRoleFilter] = createSignal<"ALL" | "USER" | "SUPER">("ALL");
  const [userPage, setUserPage] = createSignal(1);
  const [editingUserId, setEditingUserId] = createSignal<string | null>(null);
  const [editUsername, setEditUsername] = createSignal("");
  const [editEmail, setEditEmail] = createSignal("");
  const [editRole, setEditRole] = createSignal<"USER" | "SUPER">("USER");
  const [editStatus, setEditStatus] = createSignal<"ACTIVE" | "INACTIVE">("ACTIVE");

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

  const isSuper = createMemo(() => auth.me()?.role === "SUPER");

  const refreshIps = async () => {
    setIpLoading(true);
    try {
      const res = await api.get<{ entries: IpEntry[] }>("/admin/ips");
      setIpEntries(res.entries ?? []);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "LOAD_FAILED");
    } finally {
      setIpLoading(false);
    }
  };

  const refreshUsers = async () => {
    setUserLoading(true);
    try {
      const res = await api.get<{ users: UserEntry[] }>("/admin/users");
      setUsers(res.users ?? []);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "LOAD_FAILED");
    } finally {
      setUserLoading(false);
    }
  };

  const refreshAll = async (opts?: { skipIfBusy?: boolean }) => {
    if (opts?.skipIfBusy && (ipSaving() || userSaving())) return;
    await Promise.all([refreshIps(), refreshUsers()]);
  };

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
    void refreshAll();
    const id = window.setInterval(() => {
      void refreshAll({ skipIfBusy: true });
    }, 10000);
    return () => window.clearInterval(id);
  });

  const saveIp = async () => {
    const ipVal = ip().trim();
    if (!ipVal) return;
    setIpSaving(true);
    showToast("progress", "Submitting…");
    try {
      await api.post("/admin/ips", { ip: ipVal, status: ipStatus(), note: ipNote().trim() || undefined });
      showToast("success", "Submitted.");
      setIp("");
      setIpNote("");
      setIpStatus("ACTIVE");
      setIpEditing(false);
      await refreshIps();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "SAVE_FAILED");
    } finally {
      setIpSaving(false);
    }
  };

  const cancelIpEdit = () => {
    setIp("");
    setIpNote("");
    setIpStatus("ACTIVE");
    setIpEditing(false);
  };

  const beginEditUser = (u: UserEntry) => {
    setEditingUserId(u.id);
    setEditUsername(u.username);
    setEditEmail(u.email);
    setEditRole(u.role);
    setEditStatus(u.status === "ACTIVE" ? "ACTIVE" : "INACTIVE");
  };

  const saveUser = async () => {
    const id = editingUserId();
    if (!id) return;
    const username = editUsername().trim();
    const email = editEmail().trim();
    if (username.length < 2 || email.length < 3) return;
    setUserSaving(true);
    showToast("progress", "Submitting…");
    try {
      await api.post(`/admin/users/${encodeURIComponent(id)}`, {
        username,
        email,
        role: editRole(),
        status: editStatus()
      });
      showToast("success", "Submitted.");
      setEditingUserId(null);
      await refreshUsers();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "SAVE_FAILED");
    } finally {
      setUserSaving(false);
    }
  };

  const setUserStatus = async (u: UserEntry, nextStatus: "ACTIVE" | "INACTIVE") => {
    setUserSaving(true);
    showToast("progress", "Submitting…");
    try {
      await api.post(`/admin/users/${encodeURIComponent(u.id)}`, {
        username: u.username,
        email: u.email,
        role: u.role,
        status: nextStatus
      });
      showToast("success", "Submitted.");
      await refreshUsers();
      const editing = editingUserId();
      if (editing === u.id) {
        const refreshed = users().find((x) => x.id === u.id);
        if (refreshed) beginEditUser(refreshed);
      }
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "SAVE_FAILED");
    } finally {
      setUserSaving(false);
    }
  };

  const ipFiltered = createMemo(() => {
    const q = ipQuery().trim().toLowerCase();
    const f = ipStatusFilter();
    return ipEntries().filter((e) => {
      const statusOk = f === "ALL" ? true : f === "WHITELIST" ? e.status === "ACTIVE" : e.status === "INACTIVE";
      if (!statusOk) return false;
      if (!q) return true;
      const noteText = (e.note ?? "").toLowerCase();
      return e.ip.toLowerCase().includes(q) || noteText.includes(q);
    });
  });
  const ipPageSize = 10;
  const ipTotalPages = createMemo(() => Math.max(1, Math.ceil(ipFiltered().length / ipPageSize)));
  createEffect(() => {
    const p = ipPage();
    const tp = ipTotalPages();
    if (p > tp) setIpPage(tp);
    if (p < 1) setIpPage(1);
  });
  const ipPaged = createMemo(() => {
    const start = (ipPage() - 1) * ipPageSize;
    return ipFiltered().slice(start, start + ipPageSize);
  });

  const userFiltered = createMemo(() => {
    const q = userQuery().trim().toLowerCase();
    const s = userStatusFilter();
    const r = userRoleFilter();
    return users().filter((u) => {
      const statusOk = s === "ALL" ? true : s === "ACTIVE" ? u.status === "ACTIVE" : u.status === "INACTIVE";
      if (!statusOk) return false;
      const roleOk = r === "ALL" ? true : u.role === r;
      if (!roleOk) return false;
      if (!q) return true;
      return u.email.toLowerCase().includes(q) || u.username.toLowerCase().includes(q);
    });
  });
  const userPageSize = 10;
  const userTotalPages = createMemo(() => Math.max(1, Math.ceil(userFiltered().length / userPageSize)));
  createEffect(() => {
    const p = userPage();
    const tp = userTotalPages();
    if (p > tp) setUserPage(tp);
    if (p < 1) setUserPage(1);
  });
  const userPaged = createMemo(() => {
    const start = (userPage() - 1) * userPageSize;
    return userFiltered().slice(start, start + userPageSize);
  });

  return (
    <div class="shell" style="place-items: start center">
      <div class="panel">
        <div class="panelInner">
          <div class="title">
            <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap">
              <button class="btn" type="button" onClick={() => navigate("/")} disabled={ipSaving() || userSaving()}>
                Back
              </button>
              <h1 style="margin: 0">Admin</h1>
            </div>
          </div>

          <Show when={isSuper()}>
            <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 14px">
              <button class={`btn ${tab() === "ips" ? "btnPrimary" : ""}`} type="button" onClick={() => setTab("ips")}>
                IP Lists
              </button>
              <button class={`btn ${tab() === "users" ? "btnPrimary" : ""}`} type="button" onClick={() => setTab("users")}>
                User Lists
              </button>
            </div>

            <Show when={tab() === "ips"}>
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
                      <select class="select" value={ipStatus()} onChange={(e) => setIpStatus(e.currentTarget.value as "ACTIVE" | "INACTIVE")}>
                        <option value="ACTIVE">Whitelist</option>
                        <option value="INACTIVE">Blacklist</option>
                      </select>
                    </div>
                    <div class="field">
                      <label>Remarks</label>
                      <input value={ipNote()} onInput={(e) => setIpNote(e.currentTarget.value)} placeholder="e.g. Office Wi‑Fi" />
                    </div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end">
                      <Show when={ipEditing()}>
                        <button class="btn" type="button" disabled={ipSaving()} onClick={cancelIpEdit}>
                          Cancel
                        </button>
                      </Show>
                      <button class="btn btnPrimary" disabled={ipSaving() || ip().trim().length < 3} onClick={() => void saveIp()}>
                        <span style="display: inline-flex; gap: 10px; align-items: center">
                          {ipSaving() ? <span class="spinner" /> : null}
                          <span>{ipSaving() ? "Submitting…" : "Submit"}</span>
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                <div class="card" style="grid-column: span 7">
                  <div class="cardInner" style="display: grid; gap: 12px">
                    <div style="display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap">
                      <div style="font-weight: 650; letter-spacing: -0.01em">IP Lists</div>
                      <button class="btn" disabled={ipLoading()} onClick={() => void refreshIps()}>
                        <span style="display: inline-flex; gap: 10px; align-items: center">
                          {ipLoading() ? <span class="spinner" /> : null}
                          {!ipLoading() ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                              <path d="M21 3v6h-6" />
                            </svg>
                          ) : null}
                          <span>{ipLoading() ? "Loading…" : "Refresh"}</span>
                        </span>
                      </button>
                    </div>

                    <div class="filterRow filterRow2">
                      <div class="field" style="margin: 0">
                        <label>Search</label>
                        <input value={ipQuery()} onInput={(e) => setIpQuery(e.currentTarget.value)} placeholder="Search IP or remarks" />
                      </div>
                      <div class="field" style="margin: 0">
                        <label>Status</label>
                        <select
                          class="select"
                          value={ipStatusFilter()}
                          onChange={(e) => setIpStatusFilter(e.currentTarget.value as "ALL" | "WHITELIST" | "BACKLIST")}
                        >
                          <option value="ALL">All</option>
                          <option value="WHITELIST">Whitelist</option>
                          <option value="BACKLIST">Blacklist</option>
                        </select>
                      </div>
                    </div>

                    <Show
                      when={ipFiltered().length}
                      fallback={
                        ipLoading() ? (
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
                          <For each={ipPaged()}>
                            {(e) => (
                              <div style="border: 1px solid rgba(255,255,255,0.12); border-radius: 18px; padding: 12px; display: grid; gap: 8px">
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
                                    disabled={ipSaving()}
                                    onClick={() => {
                                      setIp(e.ip);
                                      setIpNote(e.note ?? "");
                                      setIpStatus(e.status === "ACTIVE" ? "ACTIVE" : "INACTIVE");
                                      setIpEditing(true);
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <Show when={e.status !== "ACTIVE"}>
                                    <button
                                      class="btn"
                                      disabled={ipSaving()}
                                      onClick={() =>
                                        void api.post("/admin/ips", { ip: e.ip, status: "ACTIVE", note: e.note ?? undefined }).then(refreshIps)
                                      }
                                    >
                                      Whitelist
                                    </button>
                                  </Show>
                                  <Show when={e.status === "ACTIVE"}>
                                    <button
                                      class="btn"
                                      disabled={ipSaving()}
                                      onClick={() =>
                                        void api.post("/admin/ips", { ip: e.ip, status: "INACTIVE", note: e.note ?? undefined }).then(refreshIps)
                                      }
                                    >
                                      Blacklist
                                    </button>
                                  </Show>
                                </div>
                              </div>
                            )}
                          </For>
                        </div>
                      </div>

                      <div style="display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap">
                        <div style="color: rgba(250,250,255,0.62); font-size: 13px">
                          Page {ipPage()} of {ipTotalPages()} • Showing {Math.min(ipPageSize, ipFiltered().length - (ipPage() - 1) * ipPageSize)} of{" "}
                          {ipFiltered().length}
                        </div>
                        <div style="display: flex; gap: 10px; align-items: center">
                          <button class="btn" disabled={ipPage() <= 1} onClick={() => setIpPage((p) => Math.max(1, p - 1))}>
                            Prev
                          </button>
                          <button class="btn" disabled={ipPage() >= ipTotalPages()} onClick={() => setIpPage((p) => Math.min(ipTotalPages(), p + 1))}>
                            Next
                          </button>
                        </div>
                      </div>
                    </Show>
                  </div>
                </div>
              </div>
            </Show>

            <Show when={tab() === "users"}>
              <div class="grid">
                <div class="card" style="grid-column: span 5">
                  <div class="cardInner updateUserCardInner" style="display: grid; gap: 12px">
                    <div style="font-weight: 650; letter-spacing: -0.01em">Update User</div>
                    <Show when={!editingUserId()}>
                      <div class="updateUserEmpty">
                        <div class="emptyCenter">
                          <div class="emptyLogo">CY</div>
                          <div class="emptyTitle">No user selected</div>
                          <div class="emptyText">Tap a user on the right to update their profile or status.</div>
                        </div>
                      </div>
                    </Show>
                    <Show when={editingUserId()}>
                      <div style="display: grid; gap: 12px">
                        <div class="field">
                          <label>Username</label>
                          <input value={editUsername()} onInput={(e) => setEditUsername(e.currentTarget.value)} />
                        </div>
                        <div class="field">
                          <label>Email</label>
                          <input value={editEmail()} onInput={(e) => setEditEmail(e.currentTarget.value)} />
                        </div>
                        <div class="field">
                          <label>Role</label>
                          <select class="select" value={editRole()} onChange={(e) => setEditRole(e.currentTarget.value as "USER" | "SUPER")}>
                            <option value="USER">User</option>
                            <option value="SUPER">Super</option>
                          </select>
                        </div>
                        <div class="field">
                          <label>Status</label>
                          <select
                            class="select"
                            value={editStatus()}
                            onChange={(e) => setEditStatus(e.currentTarget.value as "ACTIVE" | "INACTIVE")}
                          >
                            <option value="ACTIVE">Active</option>
                            <option value="INACTIVE">Inactive</option>
                          </select>
                        </div>
                        <div style="display: flex; gap: 10px; flex-wrap: wrap">
                          <button class="btn" type="button" disabled={userSaving()} onClick={() => setEditingUserId(null)}>
                            Cancel
                          </button>
                          <button class="btn btnPrimary" disabled={userSaving() || editUsername().trim().length < 2} onClick={() => void saveUser()}>
                            <span style="display: inline-flex; gap: 10px; align-items: center">
                              {userSaving() ? <span class="spinner" /> : null}
                              <span>{userSaving() ? "Submitting…" : "Submit"}</span>
                            </span>
                          </button>
                        </div>
                      </div>
                    </Show>
                  </div>
                </div>

                <div class="card" style="grid-column: span 7">
                  <div class="cardInner" style="display: grid; gap: 12px">
                    <div style="display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap">
                      <div style="font-weight: 650; letter-spacing: -0.01em">User Lists</div>
                      <button class="btn" disabled={userLoading()} onClick={() => void refreshUsers()}>
                        <span style="display: inline-flex; gap: 10px; align-items: center">
                          {userLoading() ? <span class="spinner" /> : null}
                          {!userLoading() ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                              <path d="M21 3v6h-6" />
                            </svg>
                          ) : null}
                          <span>{userLoading() ? "Loading…" : "Refresh"}</span>
                        </span>
                      </button>
                    </div>

                    <div class="filterRow filterRow3">
                      <div class="field" style="margin: 0">
                        <label>Search</label>
                        <input value={userQuery()} onInput={(e) => setUserQuery(e.currentTarget.value)} placeholder="Search email or username" />
                      </div>
                      <div class="field" style="margin: 0">
                        <label>Status</label>
                        <select
                          class="select"
                          value={userStatusFilter()}
                          onChange={(e) => setUserStatusFilter(e.currentTarget.value as "ALL" | "ACTIVE" | "INACTIVE")}
                        >
                          <option value="ALL">All</option>
                          <option value="ACTIVE">Active</option>
                          <option value="INACTIVE">Inactive</option>
                        </select>
                      </div>
                      <div class="field" style="margin: 0">
                        <label>Role</label>
                        <select
                          class="select"
                          value={userRoleFilter()}
                          onChange={(e) => setUserRoleFilter(e.currentTarget.value as "ALL" | "USER" | "SUPER")}
                        >
                          <option value="ALL">All</option>
                          <option value="USER">User</option>
                          <option value="SUPER">Super</option>
                        </select>
                      </div>
                    </div>

                    <Show
                      when={userFiltered().length}
                      fallback={
                        userLoading() ? (
                          <div style="display: grid; gap: 10px">
                            <For each={[1, 2, 3, 4, 5, 6]}>
                              {() => (
                                <div class="card" style="padding: 0">
                                  <div class="cardInner" style="display: grid; gap: 10px">
                                    <div style="display: flex; gap: 10px; align-items: baseline; justify-content: space-between">
                                      <div class="skeleton" style="height: 14px; width: 58%; border-radius: 10px" />
                                      <div style="display: inline-flex; gap: 8px">
                                        <div class="skeleton" style="height: 22px; width: 76px; border-radius: 999px" />
                                        <div class="skeleton" style="height: 22px; width: 86px; border-radius: 999px" />
                                      </div>
                                    </div>
                                    <div class="skeleton" style="height: 12px; width: 40%; border-radius: 10px" />
                                    <div style="display: flex; gap: 10px; flex-wrap: wrap">
                                      <div class="skeleton" style="height: 38px; width: 76px; border-radius: 14px" />
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
                          <For each={userPaged()}>
                            {(u) => (
                              <div style="border: 1px solid rgba(255,255,255,0.12); border-radius: 18px; padding: 12px; display: grid; gap: 8px">
                                <div style="display: flex; gap: 12px; align-items: baseline; justify-content: space-between; flex-wrap: wrap">
                                  <div style="font-weight: 750; letter-spacing: -0.01em; overflow: hidden; text-overflow: ellipsis">{u.email}</div>
                                  <div style="display: inline-flex; gap: 8px; align-items: center; flex-wrap: wrap">
                                    <span class={`statusPill ${u.role === "SUPER" ? "statusPending" : "statusInactive"}`}>{u.role}</span>
                                    <span
                                      class={`statusPill ${
                                        u.status === "ACTIVE"
                                          ? "statusActive"
                                          : u.status === "INACTIVE"
                                            ? "statusInactive"
                                            : u.status === "PENDING"
                                              ? "statusPending"
                                              : "statusDeleted"
                                      }`}
                                    >
                                      {u.status}
                                    </span>
                                  </div>
                                </div>
                                <div style="color: rgba(250,250,255,0.68); font-size: 13px; line-height: 1.4">
                                  {u.username}
                                </div>
                                <div style="display: flex; gap: 10px; flex-wrap: wrap">
                                  <button class="btn" disabled={userSaving()} onClick={() => beginEditUser(u)}>
                                    Edit
                                  </button>
                                  <button
                                    class="btn"
                                    disabled={userSaving() || (u.status !== "ACTIVE" && u.status !== "INACTIVE")}
                                    onClick={() => void setUserStatus(u, u.status === "ACTIVE" ? "INACTIVE" : "ACTIVE")}
                                  >
                                    {u.status === "ACTIVE" ? "Deactivate" : "Activate"}
                                  </button>
                                </div>
                              </div>
                            )}
                          </For>
                        </div>
                      </div>

                      <div style="display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap">
                        <div style="color: rgba(250,250,255,0.62); font-size: 13px">
                          Page {userPage()} of {userTotalPages()} • Showing{" "}
                          {Math.min(userPageSize, userFiltered().length - (userPage() - 1) * userPageSize)} of {userFiltered().length}
                        </div>
                        <div style="display: flex; gap: 10px; align-items: center">
                          <button class="btn" disabled={userPage() <= 1} onClick={() => setUserPage((p) => Math.max(1, p - 1))}>
                            Prev
                          </button>
                          <button class="btn" disabled={userPage() >= userTotalPages()} onClick={() => setUserPage((p) => Math.min(userTotalPages(), p + 1))}>
                            Next
                          </button>
                        </div>
                      </div>
                    </Show>
                  </div>
                </div>
              </div>
            </Show>
          </Show>
        </div>
      </div>
      <Toast toast={toast()} onClose={closeToast} />
    </div>
  );
}
