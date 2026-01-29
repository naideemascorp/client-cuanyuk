import { Toast, type ToastState } from "@/components/toast";
import { api } from "@/utils/api";
import { A, useNavigate, useParams } from "@solidjs/router";
import { Show, createEffect, createMemo, createSignal } from "solid-js";

export default function ResetPassword() {
  const params = useParams<{ token: string }>();
  const navigate = useNavigate();
  const token = () => params.token;

  const [pw, setPw] = createSignal("");
  const [pw2, setPw2] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [toast, setToast] = createSignal<ToastState>(null);
  let toastTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  const [touchedPw, setTouchedPw] = createSignal(false);
  const [touchedPw2, setTouchedPw2] = createSignal(false);
  const pwError = createMemo(() => {
    if (!touchedPw()) return null;
    return pw().trim().length < 8 ? "Please fill in this field." : null;
  });
  const pw2Error = createMemo(() => {
    if (!touchedPw2()) return null;
    if (pw2().trim().length === 0) return "Please fill in this field.";
    if (pw().trim().length >= 8 && pw().trim() !== pw2().trim()) return "Passwords do not match.";
    return null;
  });
  const canSubmit = createMemo(
    () =>
      !busy() && pw().trim().length >= 8 && pw2().trim().length > 0 && pw().trim() === pw2().trim(),
  );

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

  createEffect(() => {
    try {
      document.title = "Reset Password";
    } catch {}
  });

  const submit = async (e: Event) => {
    e.preventDefault();
    setTouchedPw(true);
    setTouchedPw2(true);
    if (!canSubmit()) return;
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
      await api.post<Record<string, never>>("/auth/password-reset/confirm", {
        token: token(),
        newPassword: p1,
      });
      showToast("success", "Password updated. Please sign in.");
      globalThis.setTimeout(() => navigate("/sign-in", { replace: true }), 700);
    } catch (err) {
      const code = err instanceof Error ? err.message : "RESET_FAILED";
      const msg =
        code === "TOKEN_EXPIRED"
          ? "Reset link expired. Request a new one."
          : code === "TOKEN_INVALID"
            ? "Reset link is invalid."
            : code;
      showToast("error", msg);
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
              <form
                onSubmit={submit}
                class="grid"
                style="grid-template-columns: repeat(12, 1fr); gap: 14px"
              >
                <div class="field colSpan12">
                  <label for="new_password">
                    New Password<span class="fieldReq">*</span>
                  </label>
                  <input
                    id="new_password"
                    type="password"
                    class={pwError() ? "inputError" : undefined}
                    value={pw()}
                    onInput={(e) => setPw(e.currentTarget.value)}
                    onBlur={() => setTouchedPw(true)}
                    autocomplete="new-password"
                  />
                  <Show when={pwError()}>
                    <div class="fieldError">{pwError()}</div>
                  </Show>
                </div>
                <div class="field colSpan12">
                  <label for="confirm_password">
                    Confirm Password<span class="fieldReq">*</span>
                  </label>
                  <input
                    id="confirm_password"
                    type="password"
                    class={pw2Error() ? "inputError" : undefined}
                    value={pw2()}
                    onInput={(e) => setPw2(e.currentTarget.value)}
                    onBlur={() => setTouchedPw2(true)}
                    autocomplete="new-password"
                  />
                  <Show when={pw2Error()}>
                    <div class="fieldError">{pw2Error()}</div>
                  </Show>
                </div>
                <div
                  class="colSpan12"
                  style="display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap"
                >
                  <button class="btn btnHero" type="submit" disabled={!canSubmit()}>
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
