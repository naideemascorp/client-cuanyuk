import { DateTimePicker } from "@/components/date-time-picker";
import { Modal } from "@/components/modal";
import { Toast, type ToastState } from "@/components/toast";
import { useAuth } from "@/state/auth";
import { api } from "@/utils/api";
import { useNavigate } from "@solidjs/router";
import { For, Show, createEffect, createMemo, createSignal } from "solid-js";

type IpEntry = {
  id: string;
  ip: string;
  note: string | null;
  status: "ACTIVE" | "INACTIVE" | "PENDING" | "DELETED";
};
type UserEntry = {
  id: string;
  username: string;
  email: string;
  role: "USER" | "SUPER";
  status: "ACTIVE" | "INACTIVE" | "PENDING" | "DELETED";
  createdDate: string;
  updatedDate: string;
};

type OrganizationEntry = {
  id: string;
  displayName: string;
  status: "ACTIVE" | "INACTIVE" | "PENDING" | "DELETED";
};

type NotificationEntry = {
  id: string;
  title: string;
  description: string;
  importance: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "ACTIVE" | "INACTIVE" | "PENDING" | "DELETED";
  publishAt: string;
  createdDate: string;
  updatedDate: string;
  recipientUserIds?: string[];
  recipientOrganizationIds?: string[];
  recipientRoles?: Array<"USER" | "SUPER">;
};

type Tab = "ips" | "users" | "notifications";

export default function Admin() {
  const auth = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = createSignal<Tab>("ips");
  const [toast, setToast] = createSignal<ToastState>(null);
  let toastTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let ipSearchEl: HTMLInputElement | undefined;
  let userSearchEl: HTMLInputElement | undefined;
  let notifSearchEl: HTMLInputElement | undefined;

  const markDashboardLoading = () => {
    try {
      sessionStorage.setItem("dash_loading", "1");
    } catch {}
  };

  const [ipEntries, setIpEntries] = createSignal<IpEntry[]>([]);
  const [ip, setIp] = createSignal("");
  const [ipNote, setIpNote] = createSignal("");
  const [ipStatus, setIpStatus] = createSignal<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [ipEditing, setIpEditing] = createSignal(false);
  const [ipSaving, setIpSaving] = createSignal(false);
  const [ipToggleId, setIpToggleId] = createSignal<string | null>(null);
  const [ipTouched, setIpTouched] = createSignal(false);
  const [ipLoading, setIpLoading] = createSignal(false);
  const [ipQuery, setIpQuery] = createSignal("");
  const [ipStatusFilter, setIpStatusFilter] = createSignal<"ALL" | "WHITELIST" | "BACKLIST">("ALL");
  const [ipPage, setIpPage] = createSignal(1);

  const [users, setUsers] = createSignal<UserEntry[]>([]);
  const [userLoading, setUserLoading] = createSignal(false);
  const [userSaving, setUserSaving] = createSignal(false);
  const [userQuery, setUserQuery] = createSignal("");
  const [userStatusFilter, setUserStatusFilter] = createSignal<"ALL" | "ACTIVE" | "INACTIVE">(
    "ALL",
  );
  const [userRoleFilter, setUserRoleFilter] = createSignal<"ALL" | "USER" | "SUPER">("ALL");
  const [userPage, setUserPage] = createSignal(1);
  const [editingUserId, setEditingUserId] = createSignal<string | null>(null);
  const [editUsername, setEditUsername] = createSignal("");
  const [editEmail, setEditEmail] = createSignal("");
  const [editRole, setEditRole] = createSignal<"USER" | "SUPER">("USER");
  const [editStatus, setEditStatus] = createSignal<"ACTIVE" | "INACTIVE">("ACTIVE");

  const [notifications, setNotifications] = createSignal<NotificationEntry[]>([]);
  const [notifLoading, setNotifLoading] = createSignal(false);
  const [notifSaving, setNotifSaving] = createSignal(false);
  const [notifToggleId, setNotifToggleId] = createSignal<string | null>(null);
  const [notifQuery, setNotifQuery] = createSignal("");
  const [notifStatusFilter, setNotifStatusFilter] = createSignal<"ALL" | "ACTIVE" | "INACTIVE">(
    "ALL",
  );
  const [notifPage, setNotifPage] = createSignal(1);
  const [editingNotifId, setEditingNotifId] = createSignal<string | null>(null);
  const [notifTitle, setNotifTitle] = createSignal("");
  const [notifDescription, setNotifDescription] = createSignal("");
  const [notifImportance, setNotifImportance] =
    createSignal<NotificationEntry["importance"]>("LOW");
  const [notifStatus, setNotifStatus] = createSignal<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [notifPublishAt, setNotifPublishAt] = createSignal("");
  const [notifRecipientUserIds, setNotifRecipientUserIds] = createSignal<string[]>([]);
  const [notifRecipientOrganizationIds, setNotifRecipientOrganizationIds] = createSignal<string[]>(
    [],
  );
  const [notifRecipientRoles, setNotifRecipientRoles] = createSignal<Array<"USER" | "SUPER">>([]);
  const [nowMs, setNowMs] = createSignal(Date.now());

  const [organizations, setOrganizations] = createSignal<OrganizationEntry[]>([]);
  const [orgLoading, setOrgLoading] = createSignal(false);

  const [welcomeLoading, setWelcomeLoading] = createSignal(false);
  const [welcomeSaving, setWelcomeSaving] = createSignal(false);
  const [welcomeTitle, setWelcomeTitle] = createSignal("");
  const [welcomeDescription, setWelcomeDescription] = createSignal("");
  const [welcomeStatus, setWelcomeStatus] = createSignal<"ACTIVE" | "INACTIVE">("ACTIVE");

  const [composerTarget, setComposerTarget] = createSignal<"NOTIF" | "WELCOME">("NOTIF");

  const [recipientsModalOpen, setRecipientsModalOpen] = createSignal(false);
  const [recipientsSearch, setRecipientsSearch] = createSignal("");
  const [recipientOrgSearch, setRecipientOrgSearch] = createSignal("");

  const [notifFilterModalOpen, setNotifFilterModalOpen] = createSignal(false);
  const [notifFilterUserIds, setNotifFilterUserIds] = createSignal<string[]>([]);
  const [notifFilterOrgIds, setNotifFilterOrgIds] = createSignal<string[]>([]);
  const [notifFilterRoles, setNotifFilterRoles] = createSignal<Array<"USER" | "SUPER">>([]);
  const [notifFilterSearch, setNotifFilterSearch] = createSignal("");
  const [notifFilterOrgSearch, setNotifFilterOrgSearch] = createSignal("");

  const closeToast = () => {
    if (toastTimer) globalThis.clearTimeout(toastTimer);
    toastTimer = null;
    setToast(null);
  };

  const showToast = (kind: NonNullable<ToastState>["kind"], message: string) => {
    if (toastTimer) globalThis.clearTimeout(toastTimer);
    toastTimer = null;
    setToast({ id: Date.now(), kind, message });
    toastTimer = globalThis.setTimeout(() => setToast(null), 5000);
  };

  const toDateTimeLocal = (ms: number) => {
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const fromDateTimeLocal = (raw: string) => {
    if (!raw) return null;
    const d = new Date(raw);
    if (!Number.isFinite(d.getTime())) return null;
    return d;
  };

  const minPublishLocal = createMemo(() => toDateTimeLocal(nowMs()));

  const isSuper = createMemo(() => auth.me()?.role === "SUPER");
  const activeUsers = createMemo(() => users().filter((u) => u.status === "ACTIVE"));
  const activeOrganizations = createMemo(() =>
    organizations().filter((o) => o.status === "ACTIVE"),
  );

  const ipError = createMemo(() =>
    ipTouched() && ip().trim().length === 0 ? "Device ID is required." : "",
  );

  const userLabelById = createMemo(() => {
    const map = new Map<string, string>();
    for (const u of users()) map.set(u.id, `${u.username} • ${u.email}`);
    return map;
  });

  const orgLabelById = createMemo(() => {
    const map = new Map<string, string>();
    for (const o of organizations()) map.set(o.id, o.displayName);
    return map;
  });

  const composerTitle = () => (composerTarget() === "WELCOME" ? welcomeTitle() : notifTitle());
  const setComposerTitle = (next: string) =>
    composerTarget() === "WELCOME" ? setWelcomeTitle(next) : setNotifTitle(next);

  const composerDescription = () =>
    composerTarget() === "WELCOME" ? welcomeDescription() : notifDescription();
  const setComposerDescription = (next: string) =>
    composerTarget() === "WELCOME" ? setWelcomeDescription(next) : setNotifDescription(next);

  const composerStatus = () => (composerTarget() === "WELCOME" ? welcomeStatus() : notifStatus());
  const setComposerStatus = (next: "ACTIVE" | "INACTIVE") =>
    composerTarget() === "WELCOME" ? setWelcomeStatus(next) : setNotifStatus(next);

  const composerSaving = createMemo(() =>
    composerTarget() === "WELCOME" ? welcomeSaving() : notifSaving(),
  );

  const filteredRecipientsUsers = createMemo(() => {
    const q = recipientsSearch().trim().toLowerCase();
    if (!q) return activeUsers();
    return activeUsers().filter(
      (u) => u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  });

  const filteredNotifFilterUsers = createMemo(() => {
    const q = notifFilterSearch().trim().toLowerCase();
    if (!q) return activeUsers();
    return activeUsers().filter(
      (u) => u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  });

  const filteredRecipientOrganizations = createMemo(() => {
    const q = recipientOrgSearch().trim().toLowerCase();
    if (!q) return activeOrganizations();
    return activeOrganizations().filter((o) => o.displayName.toLowerCase().includes(q));
  });

  const filteredNotifFilterOrganizations = createMemo(() => {
    const q = notifFilterOrgSearch().trim().toLowerCase();
    if (!q) return activeOrganizations();
    return activeOrganizations().filter((o) => o.displayName.toLowerCase().includes(q));
  });

  const refreshIps = async () => {
    setIpLoading(true);
    try {
      const res = await api.get<{ entries: IpEntry[] }>("/admin/devices");
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

  const refreshNotifications = async () => {
    setNotifLoading(true);
    try {
      const res = await api.get<{ entries: NotificationEntry[] }>("/admin/notifications");
      setNotifications(res.entries ?? []);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "LOAD_FAILED");
    } finally {
      setNotifLoading(false);
    }
  };

  const refreshOrganizations = async () => {
    setOrgLoading(true);
    try {
      const res = await api.get<{ organizations: OrganizationEntry[] }>("/admin/organizations");
      setOrganizations(res.organizations ?? []);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "LOAD_FAILED");
    } finally {
      setOrgLoading(false);
    }
  };

  const refreshWelcomeTemplate = async () => {
    setWelcomeLoading(true);
    try {
      const res = await api.get<{
        template: {
          key: string;
          status: "ACTIVE" | "INACTIVE";
          title: string;
          description: string;
        };
      }>("/admin/notification-templates/welcome");
      setWelcomeTitle(res.template?.title ?? "");
      setWelcomeDescription(res.template?.description ?? "");
      setWelcomeStatus(res.template?.status ?? "ACTIVE");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "LOAD_FAILED");
    } finally {
      setWelcomeLoading(false);
    }
  };

  const refreshAll = async (opts?: { skipIfBusy?: boolean }) => {
    if (
      opts?.skipIfBusy &&
      (ipSaving() ||
        userSaving() ||
        notifSaving() ||
        Boolean(ipToggleId()) ||
        Boolean(notifToggleId()))
    )
      return;
    await Promise.all([
      refreshIps(),
      refreshUsers(),
      refreshNotifications(),
      refreshOrganizations(),
      refreshWelcomeTemplate(),
    ]);
  };

  createEffect(() => {
    const handler = () => markDashboardLoading();
    globalThis.addEventListener("popstate", handler);
    return () => globalThis.removeEventListener("popstate", handler);
  });

  createEffect(() => {
    const id = globalThis.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => globalThis.clearInterval(id);
  });

  createEffect(() => {
    if (notifPublishAt()) return;
    setNotifPublishAt(toDateTimeLocal(Date.now() + 60_000));
  });

  const saveWelcomeTemplate = async () => {
    setWelcomeSaving(true);
    showToast("progress", "Submitting…");
    try {
      await api.post("/admin/notification-templates/welcome", {
        title: welcomeTitle(),
        description: welcomeDescription(),
        status: welcomeStatus(),
      });
      showToast("success", "Submitted.");
      await refreshWelcomeTemplate();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "SAVE_FAILED");
    } finally {
      setWelcomeSaving(false);
    }
  };

  const toggleNotificationStatus = async (e: NotificationEntry) => {
    if (notifToggleId()) return;
    setNotifToggleId(e.id);
    showToast("progress", "Submitting…");
    try {
      const nextStatus = e.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
      await api.post("/admin/notifications", {
        id: e.id,
        title: e.title,
        description: e.description,
        importance: e.importance,
        status: nextStatus,
        publishAt: e.publishAt,
        recipientUserIds: e.recipientUserIds ?? [],
        recipientOrganizationIds: e.recipientOrganizationIds ?? [],
        recipientRoles: e.recipientRoles ?? [],
      });
      showToast("success", nextStatus === "ACTIVE" ? "Activated." : "Deactivated.");
      await refreshNotifications();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "UPDATE_FAILED");
    } finally {
      setNotifToggleId(null);
    }
  };

  const toggleIpStatus = async (ipEntry: IpEntry, nextStatus: "ACTIVE" | "INACTIVE") => {
    if (ipToggleId()) return;
    setIpToggleId(ipEntry.id);
    showToast("progress", "Submitting…");
    try {
      await api.post("/admin/devices", {
        ip: ipEntry.ip,
        status: nextStatus,
        note: ipEntry.note ?? undefined,
      });
      showToast("success", nextStatus === "ACTIVE" ? "Whitelisted." : "Blacklisted.");
      await refreshIps();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "UPDATE_FAILED");
    } finally {
      setIpToggleId(null);
    }
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
    const id = globalThis.setInterval(() => {
      void refreshAll({ skipIfBusy: true });
    }, 10000);
    return () => globalThis.clearInterval(id);
  });

  const saveIp = async () => {
    const ipVal = ip().trim();
    setIpTouched(true);
    if (!ipVal) return;
    setIpSaving(true);
    showToast("progress", "Submitting…");
    try {
      await api.post("/admin/devices", {
        ip: ipVal,
        status: ipStatus(),
        note: ipNote().trim() || undefined,
      });
      showToast("success", "Submitted.");
      setIp("");
      setIpTouched(false);
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
    setIpTouched(false);
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
        status: editStatus(),
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
        status: nextStatus,
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

  const beginEditNotification = (n: NotificationEntry) => {
    setEditingNotifId(n.id);
    setNotifTitle(n.title);
    setNotifDescription(n.description);
    setNotifImportance(n.importance);
    setNotifStatus(n.status === "INACTIVE" ? "INACTIVE" : "ACTIVE");
    setNotifRecipientUserIds(n.recipientUserIds ?? []);
    setNotifRecipientOrganizationIds(n.recipientOrganizationIds ?? []);
    setNotifRecipientRoles(n.recipientRoles ?? []);
    const d = new Date(n.publishAt);
    setNotifPublishAt(Number.isFinite(d.getTime()) ? toDateTimeLocal(d.getTime()) : "");
  };

  const cancelNotificationEdit = () => {
    setEditingNotifId(null);
    setNotifTitle("");
    setNotifDescription("");
    setNotifImportance("LOW");
    setNotifStatus("ACTIVE");
    setNotifPublishAt(toDateTimeLocal(Date.now() + 60_000));
    setNotifRecipientUserIds([]);
    setNotifRecipientOrganizationIds([]);
    setNotifRecipientRoles([]);
  };

  const notifTitleValid = createMemo(() => notifTitle().trim().length >= 2);
  const notifDescValid = createMemo(() => notifDescription().trim().length >= 2);
  const notifPublishValid = createMemo(() => {
    const dt = fromDateTimeLocal(notifPublishAt());
    if (!dt) return false;
    return dt.getTime() > nowMs();
  });

  const saveNotification = async () => {
    const title = notifTitle().trim();
    const description = notifDescription().trim();
    const publishAtDate = fromDateTimeLocal(notifPublishAt());
    if (!publishAtDate) return;
    if (!notifTitleValid() || !notifDescValid() || !notifPublishValid()) return;
    setNotifSaving(true);
    showToast("progress", "Submitting…");
    try {
      await api.post("/admin/notifications", {
        id: editingNotifId() ?? undefined,
        title,
        description,
        importance: notifImportance(),
        status: notifStatus(),
        publishAt: publishAtDate.toISOString(),
        recipientUserIds: notifRecipientUserIds(),
        recipientOrganizationIds: notifRecipientOrganizationIds(),
        recipientRoles: notifRecipientRoles(),
      });
      showToast("success", "Submitted.");
      cancelNotificationEdit();
      await refreshNotifications();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "SAVE_FAILED");
    } finally {
      setNotifSaving(false);
    }
  };

  const notifFiltered = createMemo(() => {
    const q = notifQuery().trim().toLowerCase();
    const s = notifStatusFilter();
    const userSet = new Set(notifFilterUserIds());
    const orgSet = new Set(notifFilterOrgIds());
    const roleSet = new Set(notifFilterRoles());
    const hasAdvancedFilters = userSet.size > 0 || orgSet.size > 0 || roleSet.size > 0;
    return notifications().filter((n) => {
      const statusOk =
        s === "ALL" ? true : s === "ACTIVE" ? n.status === "ACTIVE" : n.status === "INACTIVE";
      if (!statusOk) return false;
      if (hasAdvancedFilters) {
        const matchUser = (n.recipientUserIds ?? []).some((id) => userSet.has(id));
        const matchOrg = (n.recipientOrganizationIds ?? []).some((id) => orgSet.has(id));
        const matchRole = (n.recipientRoles ?? []).some((r) => roleSet.has(r));
        if (!matchUser && !matchOrg && !matchRole) return false;
      }
      if (!q) return true;
      return (
        n.title.toLowerCase().includes(q) ||
        n.description.toLowerCase().includes(q) ||
        n.importance.toLowerCase().includes(q)
      );
    });
  });
  const notifPageSize = 10;
  const notifTotalPages = createMemo(() =>
    Math.max(1, Math.ceil(notifFiltered().length / notifPageSize)),
  );
  createEffect(() => {
    const p = notifPage();
    const tp = notifTotalPages();
    if (p > tp) setNotifPage(tp);
    if (p < 1) setNotifPage(1);
  });
  const notifPaged = createMemo(() => {
    const start = (notifPage() - 1) * notifPageSize;
    return notifFiltered().slice(start, start + notifPageSize);
  });

  const ipFiltered = createMemo(() => {
    const q = ipQuery().trim().toLowerCase();
    const f = ipStatusFilter();
    return ipEntries().filter((e) => {
      const statusOk =
        f === "ALL" ? true : f === "WHITELIST" ? e.status === "ACTIVE" : e.status === "INACTIVE";
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
      const statusOk =
        s === "ALL" ? true : s === "ACTIVE" ? u.status === "ACTIVE" : u.status === "INACTIVE";
      if (!statusOk) return false;
      const roleOk = r === "ALL" ? true : u.role === r;
      if (!roleOk) return false;
      if (!q) return true;
      return u.email.toLowerCase().includes(q) || u.username.toLowerCase().includes(q);
    });
  });
  const userPageSize = 10;
  const userTotalPages = createMemo(() =>
    Math.max(1, Math.ceil(userFiltered().length / userPageSize)),
  );
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

  const skeleton = (
    <div class="shell" style="place-items: start center">
      <div class="panel">
        <div class="panelInner">
          <div class="title" style="display: grid; gap: 14px">
            <div class="skeleton" style="height: 28px; width: 180px; border-radius: 14px" />
            <div style="display: flex; gap: 10px; flex-wrap: wrap">
              <div class="skeleton" style="height: 38px; width: 140px; border-radius: 14px" />
              <div class="skeleton" style="height: 38px; width: 160px; border-radius: 14px" />
              <div class="skeleton" style="height: 38px; width: 170px; border-radius: 14px" />
            </div>
          </div>
          <div class="grid">
            <div class="card" style="grid-column: span 5; padding: 0">
              <div class="cardInner" style="display: grid; gap: 12px">
                <div class="skeleton" style="height: 14px; width: 52%; border-radius: 10px" />
                <div class="skeleton" style="height: 44px; width: 100%; border-radius: 14px" />
                <div class="skeleton" style="height: 14px; width: 42%; border-radius: 10px" />
                <div class="skeleton" style="height: 44px; width: 100%; border-radius: 14px" />
                <div class="skeleton" style="height: 44px; width: 100%; border-radius: 14px" />
              </div>
            </div>
            <div class="card" style="grid-column: span 7; padding: 0">
              <div class="cardInner" style="display: grid; gap: 10px">
                <For each={[1, 2, 3, 4, 5, 6]}>
                  {() => (
                    <div class="skeleton" style="height: 62px; width: 100%; border-radius: 16px" />
                  )}
                </For>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const redirecting = (
    <div class="shell" style="place-items: start center">
      <div class="panel">
        <div class="panelInner">
          <div class="title">
            <h1 style="margin: 0; letter-spacing: -0.02em">Admin</h1>
          </div>
          <div style="color: rgba(250,250,255,0.72); font-size: 14px; line-height: 1.5">
            Redirecting…
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Show when={!auth.loading()} fallback={skeleton}>
      <Show when={auth.me()} fallback={redirecting}>
        <div class="shell" style="place-items: start center">
          <div class="panel">
            <div class="panelInner">
              <div class="title">
                <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap">
                  <button
                    class="iconBtn"
                    type="button"
                    onClick={() => {
                      markDashboardLoading();
                      navigate("/");
                    }}
                    disabled={ipSaving() || userSaving() || notifSaving()}
                    aria-label="Back"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <title>Back</title>
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                  </button>
                  <h1 style="margin: 0; letter-spacing: -0.02em">Admin</h1>
                </div>
              </div>

              <Show when={isSuper()}>
                <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 14px">
                  <button
                    class={`btn ${tab() === "ips" ? "btnPrimary" : ""}`}
                    type="button"
                    onClick={() => setTab("ips")}
                  >
                    Device Management
                  </button>
                  <button
                    class={`btn ${tab() === "users" ? "btnPrimary" : ""}`}
                    type="button"
                    onClick={() => setTab("users")}
                  >
                    User Management
                  </button>
                  <button
                    class={`btn ${tab() === "notifications" ? "btnPrimary" : ""}`}
                    type="button"
                    onClick={() => setTab("notifications")}
                  >
                    Notif Management
                  </button>
                </div>

                <Show when={tab() === "notifications"}>
                  <div class="grid">
                    <div class="card" style="grid-column: span 5">
                      <div class="cardInner" style="display: grid; gap: 16px">
                        <div style="display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap">
                          <div style="font-weight: 650; letter-spacing: -0.01em">
                            Notif Composer
                          </div>
                          <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center">
                            <div class="segmented">
                              <button
                                classList={{
                                  segBtn: true,
                                  segBtnActive: composerTarget() === "NOTIF",
                                }}
                                type="button"
                                onClick={() => setComposerTarget("NOTIF")}
                              >
                                Notification
                              </button>
                              <button
                                classList={{
                                  segBtn: true,
                                  segBtnActive: composerTarget() === "WELCOME",
                                }}
                                type="button"
                                onClick={() => setComposerTarget("WELCOME")}
                              >
                                Welcome
                              </button>
                            </div>
                            <Show when={composerTarget() === "NOTIF" && editingNotifId()}>
                              <button
                                class="btn"
                                type="button"
                                disabled={notifSaving()}
                                onClick={cancelNotificationEdit}
                              >
                                Cancel
                              </button>
                            </Show>
                            <button
                              class="btn btnPrimary"
                              type="button"
                              disabled={
                                composerSaving() ||
                                (composerTarget() === "NOTIF"
                                  ? !notifTitleValid() || !notifDescValid()
                                  : composerTitle().trim().length < 2 ||
                                    composerDescription().trim().length < 2)
                              }
                              onClick={() =>
                                void (composerTarget() === "WELCOME"
                                  ? saveWelcomeTemplate()
                                  : saveNotification())
                              }
                            >
                              <span style="display: inline-flex; gap: 10px; align-items: center">
                                {composerSaving() ? <span class="spinner" /> : null}
                                <span>{composerSaving() ? "Submitting…" : "Submit"}</span>
                              </span>
                            </button>
                          </div>
                        </div>

                        <div style="display: grid; gap: 12px">
                          <div class="field">
                            <label for="admin_notif_title">
                              Title<span class="fieldReq">*</span>
                            </label>
                            <input
                              id="admin_notif_title"
                              value={composerTitle()}
                              onInput={(e) => setComposerTitle(e.currentTarget.value)}
                              placeholder="Heads up, {{name}}: new feature just dropped"
                            />
                          </div>
                          <div class="field">
                            <label for="admin_notif_desc">
                              Description<span class="fieldReq">*</span>
                            </label>
                            <input
                              id="admin_notif_desc"
                              value={composerDescription()}
                              onInput={(e) => setComposerDescription(e.currentTarget.value)}
                              placeholder="Try it now and let’s see what you build next."
                            />
                          </div>

                          <div class="field">
                            <label for="admin_composer_status">Status</label>
                            <select
                              id="admin_composer_status"
                              class="select"
                              value={composerStatus()}
                              onChange={(e) =>
                                setComposerStatus(e.currentTarget.value as "ACTIVE" | "INACTIVE")
                              }
                              disabled={composerSaving()}
                            >
                              <option value="ACTIVE">Active</option>
                              <option value="INACTIVE">Inactive</option>
                            </select>
                          </div>

                          <Show when={composerTarget() === "NOTIF"}>
                            <div class="filterRow filterRow2">
                              <div class="field" style="margin: 0">
                                <label for="admin_notif_importance">Severity</label>
                                <select
                                  id="admin_notif_importance"
                                  class="select"
                                  value={notifImportance()}
                                  onChange={(e) =>
                                    setNotifImportance(
                                      e.currentTarget.value as NotificationEntry["importance"],
                                    )
                                  }
                                  disabled={notifSaving()}
                                >
                                  <option value="LOW">Low</option>
                                  <option value="MEDIUM">Medium</option>
                                  <option value="HIGH">High</option>
                                  <option value="CRITICAL">Critical</option>
                                </select>
                              </div>
                              <div class="field" style="margin: 0">
                                <label for="admin_notif_publish">Publish Date</label>
                                <DateTimePicker
                                  id="admin_notif_publish"
                                  value={notifPublishAt}
                                  onChange={setNotifPublishAt}
                                  minValue={minPublishLocal}
                                  disabled={notifSaving()}
                                />
                              </div>
                            </div>

                            <div class="field">
                              <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap">
                                <div style="color: rgba(255, 255, 255, 0.72); font-size: 13px; letter-spacing: 0.02em; text-transform: uppercase">
                                  Recipients
                                </div>
                                <div style="display: flex; gap: 10px; flex-wrap: wrap">
                                  <button
                                    class="btn"
                                    type="button"
                                    disabled={notifSaving()}
                                    onClick={() => setRecipientsModalOpen(true)}
                                  >
                                    Filters
                                  </button>
                                </div>
                              </div>
                              <Show
                                when={
                                  notifRecipientUserIds().length ||
                                  notifRecipientOrganizationIds().length ||
                                  notifRecipientRoles().length
                                }
                              >
                                <div style="display: grid; gap: 8px; margin-top: 10px">
                                  <div class="tagRow">
                                    <For each={notifRecipientUserIds().slice(0, 6)}>
                                      {(id) => (
                                        <span class="tagPill">{userLabelById().get(id) ?? id}</span>
                                      )}
                                    </For>
                                    <Show when={notifRecipientUserIds().length > 6}>
                                      <span class="tagPill">
                                        +{notifRecipientUserIds().length - 6}
                                      </span>
                                    </Show>
                                  </div>
                                  <div class="tagRow">
                                    <For each={notifRecipientOrganizationIds().slice(0, 6)}>
                                      {(id) => (
                                        <span class="tagPill">{orgLabelById().get(id) ?? id}</span>
                                      )}
                                    </For>
                                    <Show when={notifRecipientOrganizationIds().length > 6}>
                                      <span class="tagPill">
                                        +{notifRecipientOrganizationIds().length - 6}
                                      </span>
                                    </Show>
                                    <For each={notifRecipientRoles()}>
                                      {(r) => <span class="tagPill">{r}</span>}
                                    </For>
                                  </div>
                                  <div style="display: flex; justify-content: flex-end">
                                    <button
                                      class="btn"
                                      type="button"
                                      disabled={notifSaving()}
                                      onClick={() => {
                                        setNotifRecipientUserIds([]);
                                        setNotifRecipientOrganizationIds([]);
                                        setNotifRecipientRoles([]);
                                        setRecipientsSearch("");
                                        setRecipientOrgSearch("");
                                      }}
                                    >
                                      Clear
                                    </button>
                                  </div>
                                </div>
                              </Show>
                            </div>
                          </Show>

                          <div style="color: rgba(250,250,255,0.66); font-size: 12px; line-height: 1.45">
                            Placeholders: {"{{greeting}}"}, {"{{name}}"}, {"{{nameUpper}}"},{" "}
                            {"{{username}}"}, {"{{usernameUpper}}"}, {"{{email}}"},{" "}
                            {"{{emailLocalPart}}"}, {"{{emailDomain}}"}, {"{{role}}"},{" "}
                            {"{{roleLower}}"}, {"{{organizationId}}"}, {"{{organizationName}}"},{" "}
                            {"{{appName}}"}, {"{{now}}"}, {"{{date}}"}, {"{{nowTime}}"},{" "}
                            {"{{weekday}}"}, {"{{month}}"}, {"{{year}}"}, {"{{nowEpochMs}}"},{" "}
                            {"{{nowHour}}"}, {"{{nowMinute}}"}, {"{{nowSecond}}"}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div class="card" style="grid-column: span 7">
                      <div class="cardInner" style="display: grid; gap: 12px">
                        <div style="display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap">
                          <div style="font-weight: 650; letter-spacing: -0.01em">
                            Notif Management
                          </div>
                          <button
                            class="btn"
                            type="button"
                            disabled={notifLoading()}
                            onClick={() => void refreshNotifications()}
                          >
                            <span style="display: inline-flex; gap: 10px; align-items: center">
                              {notifLoading() ? <span class="spinner" /> : null}
                              {!notifLoading() ? (
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
                              <span>{notifLoading() ? "Loading…" : "Refresh"}</span>
                            </span>
                          </button>
                        </div>

                        <div class="filterRow filterRow3">
                          <div class="field" style="margin: 0">
                            <label for="admin_notif_search">Search</label>
                            <div class="inputIconWrap">
                              <input
                                ref={(el) => {
                                  notifSearchEl = el;
                                }}
                                id="admin_notif_search"
                                value={notifQuery()}
                                onInput={(e) => setNotifQuery(e.currentTarget.value)}
                                placeholder="Search title or description"
                              />
                              <button
                                class="inputIconBtn"
                                type="button"
                                aria-label="Search"
                                disabled={notifQuery().trim().length === 0}
                                onClick={() => notifSearchEl?.focus()}
                              >
                                <svg
                                  width="16"
                                  height="16"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  stroke-width="2"
                                >
                                  <title>Search</title>
                                  <circle cx="11" cy="11" r="7" />
                                  <path d="M21 21l-4.3-4.3" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          <div class="field" style="margin: 0">
                            <label for="admin_notif_status_filter">Status</label>
                            <select
                              id="admin_notif_status_filter"
                              class="select"
                              value={notifStatusFilter()}
                              onChange={(e) =>
                                setNotifStatusFilter(
                                  e.currentTarget.value as "ALL" | "ACTIVE" | "INACTIVE",
                                )
                              }
                            >
                              <option value="ALL">All</option>
                              <option value="ACTIVE">Active</option>
                              <option value="INACTIVE">Inactive</option>
                            </select>
                          </div>
                          <div class="field" style="margin: 0">
                            <div style="height: 18px" />
                            <button
                              class="btn"
                              type="button"
                              onClick={() => setNotifFilterModalOpen(true)}
                            >
                              Filters
                            </button>
                          </div>
                        </div>

                        <Show
                          when={
                            notifFilterUserIds().length ||
                            notifFilterOrgIds().length ||
                            notifFilterRoles().length
                          }
                        >
                          <div style="display: grid; gap: 8px">
                            <div class="tagRow">
                              <For each={notifFilterUserIds().slice(0, 6)}>
                                {(id) => (
                                  <span class="tagPill">{userLabelById().get(id) ?? id}</span>
                                )}
                              </For>
                              <Show when={notifFilterUserIds().length > 6}>
                                <span class="tagPill">+{notifFilterUserIds().length - 6}</span>
                              </Show>
                            </div>
                            <div class="tagRow">
                              <For each={notifFilterOrgIds().slice(0, 6)}>
                                {(id) => (
                                  <span class="tagPill">{orgLabelById().get(id) ?? id}</span>
                                )}
                              </For>
                              <Show when={notifFilterOrgIds().length > 6}>
                                <span class="tagPill">+{notifFilterOrgIds().length - 6}</span>
                              </Show>
                              <For each={notifFilterRoles()}>
                                {(r) => <span class="tagPill">{r}</span>}
                              </For>
                            </div>
                            <div style="display: flex; justify-content: flex-end">
                              <button
                                class="btn"
                                type="button"
                                onClick={() => {
                                  setNotifFilterUserIds([]);
                                  setNotifFilterOrgIds([]);
                                  setNotifFilterRoles([]);
                                  setNotifFilterSearch("");
                                }}
                              >
                                Clear
                              </button>
                            </div>
                          </div>
                        </Show>

                        <Show
                          when={notifFiltered().length}
                          fallback={
                            notifLoading() ? (
                              <div style="display: grid; gap: 10px">
                                <For each={[1, 2, 3, 4, 5, 6]}>
                                  {() => (
                                    <div class="card" style="padding: 0">
                                      <div class="cardInner" style="display: grid; gap: 10px">
                                        <div style="display: flex; gap: 10px; align-items: baseline; justify-content: space-between">
                                          <div
                                            class="skeleton"
                                            style="height: 14px; width: 58%; border-radius: 10px"
                                          />
                                          <div style="display: inline-flex; gap: 8px">
                                            <div
                                              class="skeleton"
                                              style="height: 22px; width: 76px; border-radius: 999px"
                                            />
                                            <div
                                              class="skeleton"
                                              style="height: 22px; width: 86px; border-radius: 999px"
                                            />
                                          </div>
                                        </div>
                                        <div
                                          class="skeleton"
                                          style="height: 12px; width: 62%; border-radius: 10px"
                                        />
                                        <div style="display: flex; gap: 10px; flex-wrap: wrap">
                                          <div
                                            class="skeleton"
                                            style="height: 38px; width: 76px; border-radius: 14px"
                                          />
                                          <div
                                            class="skeleton"
                                            style="height: 38px; width: 110px; border-radius: 14px"
                                          />
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
                              <For each={notifPaged()}>
                                {(e) => {
                                  const publishMs = () => new Date(e.publishAt).getTime();
                                  const scheduled = () =>
                                    Number.isFinite(publishMs()) && publishMs() > nowMs();
                                  const severityText = () =>
                                    e.importance === "LOW"
                                      ? "Low"
                                      : e.importance === "MEDIUM"
                                        ? "Medium"
                                        : e.importance === "HIGH"
                                          ? "High"
                                          : "Critical";
                                  const severityPillClass = () =>
                                    `statusPill ${
                                      e.importance === "LOW"
                                        ? "statusInactive"
                                        : e.importance === "MEDIUM"
                                          ? "statusPending"
                                          : e.importance === "HIGH"
                                            ? "statusActive"
                                            : "statusDeleted"
                                    }`;
                                  const pillClass = () =>
                                    `statusPill ${
                                      e.status !== "ACTIVE"
                                        ? "statusInactive"
                                        : scheduled()
                                          ? "statusPending"
                                          : "statusActive"
                                    }`;
                                  const pillText = () =>
                                    e.status !== "ACTIVE"
                                      ? "Inactive"
                                      : scheduled()
                                        ? "Scheduled"
                                        : "Published";
                                  return (
                                    <div style="border: 1px solid rgba(255,255,255,0.12); border-radius: 18px; padding: 12px; display: grid; gap: 8px">
                                      <div style="display: flex; gap: 12px; align-items: baseline; justify-content: space-between; flex-wrap: wrap">
                                        <div style="font-weight: 700; letter-spacing: -0.01em; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
                                          {e.title}
                                        </div>
                                        <div style="display: inline-flex; gap: 8px; align-items: center; flex-wrap: wrap">
                                          <span class={severityPillClass()}>{severityText()}</span>
                                          <span class={pillClass()}>{pillText()}</span>
                                        </div>
                                      </div>
                                      <div style="color: rgba(250,250,255,0.68); font-size: 13px; line-height: 1.4">
                                        {e.description}
                                      </div>
                                      <Show
                                        when={
                                          (e.recipientUserIds ?? []).length > 0 ||
                                          (e.recipientOrganizationIds ?? []).length > 0 ||
                                          (e.recipientRoles ?? []).length > 0
                                        }
                                      >
                                        <div style="color: rgba(250,250,255,0.55); font-size: 12px">
                                          Recipients: {(e.recipientUserIds ?? []).length} user
                                          {(e.recipientUserIds ?? []).length === 1 ? "" : "s"} •{" "}
                                          {(e.recipientOrganizationIds ?? []).length} org
                                          {(e.recipientOrganizationIds ?? []).length === 1
                                            ? ""
                                            : "s"}{" "}
                                          • {(e.recipientRoles ?? []).length} role
                                          {(e.recipientRoles ?? []).length === 1 ? "" : "s"}
                                        </div>
                                      </Show>
                                      <div style="display: flex; gap: 10px; flex-wrap: wrap">
                                        <button
                                          class="btn"
                                          type="button"
                                          disabled={notifSaving() || Boolean(notifToggleId())}
                                          onClick={() => beginEditNotification(e)}
                                        >
                                          Update
                                        </button>
                                        <button
                                          class="btn"
                                          type="button"
                                          disabled={notifSaving() || Boolean(notifToggleId())}
                                          onClick={() => void toggleNotificationStatus(e)}
                                        >
                                          <span style="display: inline-flex; gap: 10px; align-items: center">
                                            {notifToggleId() === e.id ? (
                                              <span class="spinner" />
                                            ) : null}
                                            <span>
                                              {e.status === "ACTIVE" ? "Deactivate" : "Activate"}
                                            </span>
                                          </span>
                                        </button>
                                      </div>
                                    </div>
                                  );
                                }}
                              </For>
                            </div>
                          </div>

                          <div style="display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap">
                            <div style="color: rgba(250,250,255,0.62); font-size: 13px">
                              Page {notifPage()} of {notifTotalPages()} • Showing{" "}
                              {Math.min(
                                notifPageSize,
                                notifFiltered().length - (notifPage() - 1) * notifPageSize,
                              )}{" "}
                              of {notifFiltered().length}
                            </div>
                            <div style="display: flex; gap: 10px; align-items: center">
                              <button
                                class="btn"
                                type="button"
                                disabled={notifPage() <= 1}
                                onClick={() => setNotifPage((p) => Math.max(1, p - 1))}
                              >
                                Prev
                              </button>
                              <button
                                class="btn"
                                type="button"
                                disabled={notifPage() >= notifTotalPages()}
                                onClick={() =>
                                  setNotifPage((p) => Math.min(notifTotalPages(), p + 1))
                                }
                              >
                                Next
                              </button>
                            </div>
                          </div>
                        </Show>
                      </div>
                    </div>
                  </div>
                </Show>

                <Show when={tab() === "ips"}>
                  <div class="grid">
                    <div class="card" style="grid-column: span 5">
                      <div class="cardInner" style="display: grid; gap: 12px">
                        <div style="font-weight: 650; letter-spacing: -0.01em">
                          Create/Update Device
                        </div>
                        <div class="field">
                          <label for="admin_ip_address">
                            Device ID<span class="fieldReq">*</span>
                          </label>
                          <input
                            id="admin_ip_address"
                            class={ipError() ? "inputError" : undefined}
                            value={ip()}
                            onInput={(e) => setIp(e.currentTarget.value)}
                            onBlur={() => setIpTouched(true)}
                            placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                          />
                          <Show when={ipError()}>
                            <div class="fieldError">{ipError()}</div>
                          </Show>
                        </div>
                        <div class="field">
                          <label for="admin_ip_status">Status</label>
                          <select
                            id="admin_ip_status"
                            class="select"
                            value={ipStatus()}
                            onChange={(e) =>
                              setIpStatus(e.currentTarget.value as "ACTIVE" | "INACTIVE")
                            }
                          >
                            <option value="ACTIVE">Whitelist</option>
                            <option value="INACTIVE">Blacklist</option>
                          </select>
                        </div>
                        <div class="field">
                          <label for="admin_ip_remarks">Remarks</label>
                          <input
                            id="admin_ip_remarks"
                            value={ipNote()}
                            onInput={(e) => setIpNote(e.currentTarget.value)}
                            placeholder="e.g. Dimas MacBook Pro"
                          />
                        </div>
                        <div style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end">
                          <Show when={ipEditing()}>
                            <button
                              class="btn"
                              type="button"
                              disabled={ipSaving()}
                              onClick={cancelIpEdit}
                            >
                              Cancel
                            </button>
                          </Show>
                          <button
                            class="btn btnPrimary"
                            type="button"
                            disabled={ipSaving() || ip().trim().length < 3}
                            onClick={() => void saveIp()}
                          >
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
                          <div style="font-weight: 650; letter-spacing: -0.01em">
                            Device Management
                          </div>
                          <button
                            class="btn"
                            type="button"
                            disabled={ipLoading()}
                            onClick={() => void refreshIps()}
                          >
                            <span style="display: inline-flex; gap: 10px; align-items: center">
                              {ipLoading() ? <span class="spinner" /> : null}
                              {!ipLoading() ? (
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
                              <span>{ipLoading() ? "Loading…" : "Refresh"}</span>
                            </span>
                          </button>
                        </div>

                        <div class="filterRow filterRow2">
                          <div class="field" style="margin: 0">
                            <label for="admin_ip_search">Search</label>
                            <div class="inputIconWrap">
                              <input
                                ref={(el) => {
                                  ipSearchEl = el;
                                }}
                                id="admin_ip_search"
                                value={ipQuery()}
                                onInput={(e) => setIpQuery(e.currentTarget.value)}
                                placeholder="Search device ID or remarks"
                              />
                              <button
                                class="inputIconBtn"
                                type="button"
                                aria-label="Search"
                                disabled={ipQuery().trim().length === 0}
                                onClick={() => ipSearchEl?.focus()}
                              >
                                <svg
                                  width="16"
                                  height="16"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  stroke-width="2"
                                >
                                  <title>Search</title>
                                  <circle cx="11" cy="11" r="7" />
                                  <path d="M21 21l-4.3-4.3" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          <div class="field" style="margin: 0">
                            <label for="admin_ip_status_filter">Status</label>
                            <select
                              id="admin_ip_status_filter"
                              class="select"
                              value={ipStatusFilter()}
                              onChange={(e) =>
                                setIpStatusFilter(
                                  e.currentTarget.value as "ALL" | "WHITELIST" | "BACKLIST",
                                )
                              }
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
                                          <div
                                            class="skeleton"
                                            style="height: 14px; width: 46%; border-radius: 10px"
                                          />
                                          <div
                                            class="skeleton"
                                            style="height: 22px; width: 92px; border-radius: 999px"
                                          />
                                        </div>
                                        <div
                                          class="skeleton"
                                          style="height: 12px; width: 62%; border-radius: 10px"
                                        />
                                        <div style="display: flex; gap: 10px; flex-wrap: wrap">
                                          <div
                                            class="skeleton"
                                            style="height: 38px; width: 92px; border-radius: 14px"
                                          />
                                          <div
                                            class="skeleton"
                                            style="height: 38px; width: 110px; border-radius: 14px"
                                          />
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
                                      <div style="font-weight: 700; letter-spacing: -0.01em">
                                        {e.ip}
                                      </div>
                                      <span
                                        class={`statusPill ${e.status === "ACTIVE" ? "statusActive" : "statusInactive"}`}
                                      >
                                        {e.status === "ACTIVE" ? "Whitelisted" : "Blacklisted"}
                                      </span>
                                    </div>
                                    <div style="color: rgba(250,250,255,0.68); font-size: 13px; line-height: 1.4">
                                      {e.note ?? "—"}
                                    </div>
                                    <div style="display: flex; gap: 10px; flex-wrap: wrap">
                                      <button
                                        class="btn"
                                        type="button"
                                        disabled={ipSaving() || Boolean(ipToggleId())}
                                        onClick={() => {
                                          setIp(e.ip);
                                          setIpTouched(false);
                                          setIpNote(e.note ?? "");
                                          setIpStatus(
                                            e.status === "ACTIVE" ? "ACTIVE" : "INACTIVE",
                                          );
                                          setIpEditing(true);
                                        }}
                                      >
                                        Update
                                      </button>
                                      <Show when={e.status !== "ACTIVE"}>
                                        <button
                                          class="btn"
                                          type="button"
                                          disabled={ipSaving() || Boolean(ipToggleId())}
                                          onClick={() => void toggleIpStatus(e, "ACTIVE")}
                                        >
                                          <span style="display: inline-flex; gap: 10px; align-items: center">
                                            {ipToggleId() === e.id ? (
                                              <span class="spinner" />
                                            ) : null}
                                            <span>Whitelist</span>
                                          </span>
                                        </button>
                                      </Show>
                                      <Show when={e.status === "ACTIVE"}>
                                        <button
                                          class="btn"
                                          type="button"
                                          disabled={ipSaving() || Boolean(ipToggleId())}
                                          onClick={() => void toggleIpStatus(e, "INACTIVE")}
                                        >
                                          <span style="display: inline-flex; gap: 10px; align-items: center">
                                            {ipToggleId() === e.id ? (
                                              <span class="spinner" />
                                            ) : null}
                                            <span>Blacklist</span>
                                          </span>
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
                              Page {ipPage()} of {ipTotalPages()} • Showing{" "}
                              {Math.min(
                                ipPageSize,
                                ipFiltered().length - (ipPage() - 1) * ipPageSize,
                              )}{" "}
                              of {ipFiltered().length}
                            </div>
                            <div style="display: flex; gap: 10px; align-items: center">
                              <button
                                class="btn"
                                type="button"
                                disabled={ipPage() <= 1}
                                onClick={() => setIpPage((p) => Math.max(1, p - 1))}
                              >
                                Prev
                              </button>
                              <button
                                class="btn"
                                type="button"
                                disabled={ipPage() >= ipTotalPages()}
                                onClick={() => setIpPage((p) => Math.min(ipTotalPages(), p + 1))}
                              >
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
                              <div class="emptyText">
                                Tap a user on the right to update their profile or status.
                              </div>
                            </div>
                          </div>
                        </Show>
                        <Show when={editingUserId()}>
                          <div style="display: grid; gap: 12px">
                            <div class="field">
                              <label for="admin_user_username">Username</label>
                              <input
                                id="admin_user_username"
                                value={editUsername()}
                                onInput={(e) => setEditUsername(e.currentTarget.value)}
                              />
                            </div>
                            <div class="field">
                              <label for="admin_user_email">Email</label>
                              <input
                                id="admin_user_email"
                                value={editEmail()}
                                onInput={(e) => setEditEmail(e.currentTarget.value)}
                              />
                            </div>
                            <div class="field">
                              <label for="admin_user_role">Role</label>
                              <select
                                id="admin_user_role"
                                class="select"
                                value={editRole()}
                                onChange={(e) =>
                                  setEditRole(e.currentTarget.value as "USER" | "SUPER")
                                }
                              >
                                <option value="USER">User</option>
                                <option value="SUPER">Super</option>
                              </select>
                            </div>
                            <div class="field">
                              <label for="admin_user_status">Status</label>
                              <select
                                id="admin_user_status"
                                class="select"
                                value={editStatus()}
                                onChange={(e) =>
                                  setEditStatus(e.currentTarget.value as "ACTIVE" | "INACTIVE")
                                }
                              >
                                <option value="ACTIVE">Active</option>
                                <option value="INACTIVE">Inactive</option>
                              </select>
                            </div>
                            <div style="display: flex; gap: 10px; flex-wrap: wrap">
                              <button
                                class="btn"
                                type="button"
                                disabled={userSaving()}
                                onClick={() => setEditingUserId(null)}
                              >
                                Cancel
                              </button>
                              <button
                                class="btn btnPrimary"
                                type="button"
                                disabled={userSaving() || editUsername().trim().length < 2}
                                onClick={() => void saveUser()}
                              >
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
                          <div style="font-weight: 650; letter-spacing: -0.01em">
                            User Management
                          </div>
                          <button
                            class="btn"
                            type="button"
                            disabled={userLoading()}
                            onClick={() => void refreshUsers()}
                          >
                            <span style="display: inline-flex; gap: 10px; align-items: center">
                              {userLoading() ? <span class="spinner" /> : null}
                              {!userLoading() ? (
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
                              <span>{userLoading() ? "Loading…" : "Refresh"}</span>
                            </span>
                          </button>
                        </div>

                        <div class="filterRow filterRow3">
                          <div class="field" style="margin: 0">
                            <label for="admin_user_search">Search</label>
                            <div class="inputIconWrap">
                              <input
                                ref={(el) => {
                                  userSearchEl = el;
                                }}
                                id="admin_user_search"
                                value={userQuery()}
                                onInput={(e) => setUserQuery(e.currentTarget.value)}
                                placeholder="Search email or username"
                              />
                              <button
                                class="inputIconBtn"
                                type="button"
                                aria-label="Search"
                                disabled={userQuery().trim().length === 0}
                                onClick={() => userSearchEl?.focus()}
                              >
                                <svg
                                  width="16"
                                  height="16"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  stroke-width="2"
                                >
                                  <title>Search</title>
                                  <circle cx="11" cy="11" r="7" />
                                  <path d="M21 21l-4.3-4.3" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          <div class="field" style="margin: 0">
                            <label for="admin_user_status_filter">Status</label>
                            <select
                              id="admin_user_status_filter"
                              class="select"
                              value={userStatusFilter()}
                              onChange={(e) =>
                                setUserStatusFilter(
                                  e.currentTarget.value as "ALL" | "ACTIVE" | "INACTIVE",
                                )
                              }
                            >
                              <option value="ALL">All</option>
                              <option value="ACTIVE">Active</option>
                              <option value="INACTIVE">Inactive</option>
                            </select>
                          </div>
                          <div class="field" style="margin: 0">
                            <label for="admin_user_role_filter">Role</label>
                            <select
                              id="admin_user_role_filter"
                              class="select"
                              value={userRoleFilter()}
                              onChange={(e) =>
                                setUserRoleFilter(e.currentTarget.value as "ALL" | "USER" | "SUPER")
                              }
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
                                          <div
                                            class="skeleton"
                                            style="height: 14px; width: 58%; border-radius: 10px"
                                          />
                                          <div style="display: inline-flex; gap: 8px">
                                            <div
                                              class="skeleton"
                                              style="height: 22px; width: 76px; border-radius: 999px"
                                            />
                                            <div
                                              class="skeleton"
                                              style="height: 22px; width: 86px; border-radius: 999px"
                                            />
                                          </div>
                                        </div>
                                        <div
                                          class="skeleton"
                                          style="height: 12px; width: 40%; border-radius: 10px"
                                        />
                                        <div style="display: flex; gap: 10px; flex-wrap: wrap">
                                          <div
                                            class="skeleton"
                                            style="height: 38px; width: 76px; border-radius: 14px"
                                          />
                                          <div
                                            class="skeleton"
                                            style="height: 38px; width: 110px; border-radius: 14px"
                                          />
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
                                      <div style="font-weight: 750; letter-spacing: -0.01em; overflow: hidden; text-overflow: ellipsis">
                                        {u.email}
                                      </div>
                                      <div style="display: inline-flex; gap: 8px; align-items: center; flex-wrap: wrap">
                                        <span
                                          class={`statusPill ${u.role === "SUPER" ? "statusPending" : "statusInactive"}`}
                                        >
                                          {u.role}
                                        </span>
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
                                      <button
                                        class="btn"
                                        type="button"
                                        disabled={userSaving()}
                                        onClick={() => beginEditUser(u)}
                                      >
                                        Update
                                      </button>
                                      <button
                                        class="btn"
                                        type="button"
                                        disabled={
                                          userSaving() ||
                                          (u.status !== "ACTIVE" && u.status !== "INACTIVE")
                                        }
                                        onClick={() =>
                                          void setUserStatus(
                                            u,
                                            u.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                                          )
                                        }
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
                              {Math.min(
                                userPageSize,
                                userFiltered().length - (userPage() - 1) * userPageSize,
                              )}{" "}
                              of {userFiltered().length}
                            </div>
                            <div style="display: flex; gap: 10px; align-items: center">
                              <button
                                class="btn"
                                type="button"
                                disabled={userPage() <= 1}
                                onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                              >
                                Prev
                              </button>
                              <button
                                class="btn"
                                type="button"
                                disabled={userPage() >= userTotalPages()}
                                onClick={() =>
                                  setUserPage((p) => Math.min(userTotalPages(), p + 1))
                                }
                              >
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
          <Modal open={recipientsModalOpen()} onClose={() => setRecipientsModalOpen(false)}>
            <div style="display: grid; gap: 12px">
              <div style="display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap">
                <div style="font-weight: 650; letter-spacing: -0.01em">Filters</div>
                <button class="btn" type="button" onClick={() => setRecipientsModalOpen(false)}>
                  Close
                </button>
              </div>

              <div class="filterRow filterRow2">
                <div class="field" style="margin: 0">
                  <label for="admin_recipients_filter_user_search">User Search</label>
                  <input
                    id="admin_recipients_filter_user_search"
                    value={recipientsSearch()}
                    onInput={(e) => setRecipientsSearch(e.currentTarget.value)}
                    placeholder="Search username or email"
                  />
                </div>
                <div class="field" style="margin: 0">
                  <label for="admin_recipients_filter_org_search">Org Search</label>
                  <input
                    id="admin_recipients_filter_org_search"
                    value={recipientOrgSearch()}
                    onInput={(e) => setRecipientOrgSearch(e.currentTarget.value)}
                    placeholder="Search organizations"
                  />
                </div>
              </div>

              <div class="modalListScroll">
                <div style="display: grid; gap: 16px">
                  <div style="display: grid; gap: 10px">
                    <div style="font-weight: 700; letter-spacing: -0.01em">Users</div>
                    <div style="display: grid; gap: 10px">
                      <For each={filteredRecipientsUsers()}>
                        {(u) => {
                          const checked = () => notifRecipientUserIds().includes(u.id);
                          return (
                            <label style="display: flex; gap: 12px; align-items: center; padding: 10px 12px; border: 1px solid rgba(255,255,255,0.12); border-radius: 18px; cursor: pointer">
                              <input
                                type="checkbox"
                                checked={checked()}
                                onChange={() => {
                                  const next = checked()
                                    ? notifRecipientUserIds().filter((x) => x !== u.id)
                                    : [...notifRecipientUserIds(), u.id];
                                  setNotifRecipientUserIds(next);
                                }}
                              />
                              <div style="display: grid; gap: 2px; min-width: 0">
                                <div style="font-weight: 700; letter-spacing: -0.01em">
                                  {u.username}
                                </div>
                                <div style="color: rgba(250,250,255,0.62); font-size: 12px; overflow: hidden; text-overflow: ellipsis">
                                  {u.email}
                                </div>
                              </div>
                            </label>
                          );
                        }}
                      </For>
                    </div>
                  </div>

                  <div style="display: grid; gap: 10px">
                    <div style="font-weight: 700; letter-spacing: -0.01em">Organizations</div>
                    <div style="display: grid; gap: 10px">
                      <For each={filteredRecipientOrganizations()}>
                        {(o) => {
                          const checked = () => notifRecipientOrganizationIds().includes(o.id);
                          return (
                            <label style="display: flex; gap: 12px; align-items: center; padding: 10px 12px; border: 1px solid rgba(255,255,255,0.12); border-radius: 18px; cursor: pointer">
                              <input
                                type="checkbox"
                                checked={checked()}
                                onChange={() => {
                                  const next = checked()
                                    ? notifRecipientOrganizationIds().filter((x) => x !== o.id)
                                    : [...notifRecipientOrganizationIds(), o.id];
                                  setNotifRecipientOrganizationIds(next);
                                }}
                              />
                              <div style="font-weight: 700; letter-spacing: -0.01em">
                                {o.displayName}
                              </div>
                            </label>
                          );
                        }}
                      </For>
                    </div>
                  </div>

                  <div style="display: grid; gap: 10px">
                    <div style="font-weight: 700; letter-spacing: -0.01em">Roles</div>
                    <div style="display: grid; gap: 10px">
                      <For each={["USER", "SUPER"] as const}>
                        {(r) => {
                          const checked = () => notifRecipientRoles().includes(r);
                          return (
                            <label style="display: flex; gap: 12px; align-items: center; padding: 10px 12px; border: 1px solid rgba(255,255,255,0.12); border-radius: 18px; cursor: pointer">
                              <input
                                type="checkbox"
                                checked={checked()}
                                onChange={() => {
                                  const next = checked()
                                    ? notifRecipientRoles().filter((x) => x !== r)
                                    : [...notifRecipientRoles(), r];
                                  setNotifRecipientRoles(next);
                                }}
                              />
                              <div style="font-weight: 700; letter-spacing: -0.01em">{r}</div>
                            </label>
                          );
                        }}
                      </For>
                    </div>
                  </div>
                </div>
              </div>

              <div style="display: flex; gap: 10px; justify-content: space-between; flex-wrap: wrap; align-items: center">
                <div style="color: rgba(250,250,255,0.62); font-size: 12px">
                  Users: {notifRecipientUserIds().length} • Orgs:{" "}
                  {notifRecipientOrganizationIds().length} • Roles: {notifRecipientRoles().length}
                </div>
                <div style="display: flex; gap: 10px; flex-wrap: wrap">
                  <button
                    class="btn"
                    type="button"
                    onClick={() => {
                      setNotifRecipientUserIds([]);
                      setNotifRecipientOrganizationIds([]);
                      setNotifRecipientRoles([]);
                      setRecipientsSearch("");
                      setRecipientOrgSearch("");
                    }}
                  >
                    Clear
                  </button>
                  <button
                    class="btn btnPrimary"
                    type="button"
                    onClick={() => setRecipientsModalOpen(false)}
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </Modal>

          <Modal open={notifFilterModalOpen()} onClose={() => setNotifFilterModalOpen(false)}>
            <div style="display: grid; gap: 12px">
              <div style="display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap">
                <div style="font-weight: 650; letter-spacing: -0.01em">Filters</div>
                <button class="btn" type="button" onClick={() => setNotifFilterModalOpen(false)}>
                  Close
                </button>
              </div>

              <div class="filterRow filterRow2">
                <div class="field" style="margin: 0">
                  <label for="admin_notif_filter_user_search">User Search</label>
                  <input
                    id="admin_notif_filter_user_search"
                    value={notifFilterSearch()}
                    onInput={(e) => setNotifFilterSearch(e.currentTarget.value)}
                    placeholder="Search username or email"
                  />
                </div>
                <div class="field" style="margin: 0">
                  <label for="admin_notif_filter_org_search">Org Search</label>
                  <input
                    id="admin_notif_filter_org_search"
                    value={notifFilterOrgSearch()}
                    onInput={(e) => setNotifFilterOrgSearch(e.currentTarget.value)}
                    placeholder="Search organizations"
                  />
                </div>
              </div>

              <div class="modalListScroll">
                <div style="display: grid; gap: 16px">
                  <div style="display: grid; gap: 10px">
                    <div style="font-weight: 700; letter-spacing: -0.01em">Users</div>
                    <div style="display: grid; gap: 10px">
                      <For each={filteredNotifFilterUsers()}>
                        {(u) => {
                          const checked = () => notifFilterUserIds().includes(u.id);
                          return (
                            <label style="display: flex; gap: 12px; align-items: center; padding: 10px 12px; border: 1px solid rgba(255,255,255,0.12); border-radius: 18px; cursor: pointer">
                              <input
                                type="checkbox"
                                checked={checked()}
                                onChange={() => {
                                  const next = checked()
                                    ? notifFilterUserIds().filter((x) => x !== u.id)
                                    : [...notifFilterUserIds(), u.id];
                                  setNotifFilterUserIds(next);
                                }}
                              />
                              <div style="display: grid; gap: 2px; min-width: 0">
                                <div style="font-weight: 700; letter-spacing: -0.01em">
                                  {u.username}
                                </div>
                                <div style="color: rgba(250,250,255,0.62); font-size: 12px; overflow: hidden; text-overflow: ellipsis">
                                  {u.email}
                                </div>
                              </div>
                            </label>
                          );
                        }}
                      </For>
                    </div>
                  </div>

                  <div style="display: grid; gap: 10px">
                    <div style="font-weight: 700; letter-spacing: -0.01em">Organizations</div>
                    <div style="display: grid; gap: 10px">
                      <For each={filteredNotifFilterOrganizations()}>
                        {(o) => {
                          const checked = () => notifFilterOrgIds().includes(o.id);
                          return (
                            <label style="display: flex; gap: 12px; align-items: center; padding: 10px 12px; border: 1px solid rgba(255,255,255,0.12); border-radius: 18px; cursor: pointer">
                              <input
                                type="checkbox"
                                checked={checked()}
                                onChange={() => {
                                  const next = checked()
                                    ? notifFilterOrgIds().filter((x) => x !== o.id)
                                    : [...notifFilterOrgIds(), o.id];
                                  setNotifFilterOrgIds(next);
                                }}
                              />
                              <div style="font-weight: 700; letter-spacing: -0.01em">
                                {o.displayName}
                              </div>
                            </label>
                          );
                        }}
                      </For>
                    </div>
                  </div>

                  <div style="display: grid; gap: 10px">
                    <div style="font-weight: 700; letter-spacing: -0.01em">Roles</div>
                    <div style="display: grid; gap: 10px">
                      <For each={["USER", "SUPER"] as const}>
                        {(r) => {
                          const checked = () => notifFilterRoles().includes(r);
                          return (
                            <label style="display: flex; gap: 12px; align-items: center; padding: 10px 12px; border: 1px solid rgba(255,255,255,0.12); border-radius: 18px; cursor: pointer">
                              <input
                                type="checkbox"
                                checked={checked()}
                                onChange={() => {
                                  const next = checked()
                                    ? notifFilterRoles().filter((x) => x !== r)
                                    : [...notifFilterRoles(), r];
                                  setNotifFilterRoles(next);
                                }}
                              />
                              <div style="font-weight: 700; letter-spacing: -0.01em">{r}</div>
                            </label>
                          );
                        }}
                      </For>
                    </div>
                  </div>
                </div>
              </div>

              <div style="display: flex; gap: 10px; justify-content: space-between; flex-wrap: wrap; align-items: center">
                <div style="color: rgba(250,250,255,0.62); font-size: 12px">
                  Users: {notifFilterUserIds().length} • Orgs: {notifFilterOrgIds().length} • Roles:{" "}
                  {notifFilterRoles().length}
                </div>
                <div style="display: flex; gap: 10px; flex-wrap: wrap">
                  <button
                    class="btn"
                    type="button"
                    onClick={() => {
                      setNotifFilterUserIds([]);
                      setNotifFilterOrgIds([]);
                      setNotifFilterRoles([]);
                      setNotifFilterSearch("");
                      setNotifFilterOrgSearch("");
                    }}
                  >
                    Clear
                  </button>
                  <button
                    class="btn btnPrimary"
                    type="button"
                    onClick={() => setNotifFilterModalOpen(false)}
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </Modal>

          <Toast toast={toast()} onClose={closeToast} />
        </div>
      </Show>
    </Show>
  );
}
