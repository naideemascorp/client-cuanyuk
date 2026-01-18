import { A, useParams, useNavigate } from "@solidjs/router";
import { createEffect, createSignal } from "solid-js";
import { Toast, type ToastState } from "../components/toast";
import { api } from "../utils/api";

export default function ResetPassword() {
  const params = useParams<{ token: string }>();
  const navigate = useNavigate();
  const token = () => params.token;

  const [pw, setPw] = createSignal("");
  const [pw2, setPw2] = createSignal("");
  const [busy, setBusy] = createSignal(false);
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

  createEffect(() => {
    try {
      document.title = "Reset Password";
    } catch {}
  });

  const submit = async (e: Event) => {
    e.preventDefault();
    const p1 = pw().trim();
    const p2 = pw2().trim();
    if (p1.length < 8) {
      showToast("error", "Password must be at least 8 characters.");
      return;
    }
    if (p1 !== p2) {
      showToast("error", "Passwords do not match.");
      return;
    }
    setBusy(true);
    showToast("progress", "Resetting password…");
    try {
      const res = await api.post<{ ok: boolean; code?: string }>("/auth/password-reset/confirm", { token: token(), newPassword: p1 });
      if (!res.ok) {
        const code = res.code ?? "RESET_FAILED";
        const msg = code === "TOKEN_EXPIRED" ? "Reset link expired. Request a new one." : "Reset link is invalid.";
        showToast("error", msg);
        return;
      }
      showToast("success", "Password updated. Please sign in.");
      window.setTimeout(() => navigate("/sign-in", { replace: true }), 700);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "RESET_FAILED");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="shell">
      <div class="panel">
        <div class="panelInner">
          <div class="title">
            <h1>Reset Password</h1>
            <p>Create a new password for your account.</p>
          </div>

          <div class="card">
            <div class="cardInner">
              <form onSubmit={submit} class="grid" style="grid-template-columns: repeat(12, 1fr); gap: 14px">
                <div class="field" style="grid-column: span 12">
                  <label>New Password</label>
                  <input type="password" value={pw()} onInput={(e) => setPw(e.currentTarget.value)} autocomplete="new-password" />
                </div>
                <div class="field" style="grid-column: span 12">
                  <label>Confirm Password</label>
                  <input type="password" value={pw2()} onInput={(e) => setPw2(e.currentTarget.value)} autocomplete="new-password" />
                </div>
                <div style="grid-column: span 12; display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap">
                  <button class="btn btnHero" type="submit" disabled={busy()}>
                    <span style="display: inline-flex; gap: 10px; align-items: center">
                      {busy() ? <span class="spinner" /> : null}
                      <span>{busy() ? "Working…" : "Submit"}</span>
                    </span>
                  </button>
                  <A class="pillLink" href="/sign-in">
                    Back to Sign In
                  </A>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
      <Toast toast={toast()} onClose={closeToast} />
    </div>
  );
}

