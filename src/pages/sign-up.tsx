import { Toast, type ToastState } from "@/components/toast";
import { api } from "@/utils/api";
import { A, useNavigate } from "@solidjs/router";
import { Show, createEffect, createMemo, createSignal, onMount } from "solid-js";

const humanMessage = (raw: string): string => {
  const key = raw.toUpperCase().replace(/\s+/g, "_");
  const map: Record<string, string> = {
    DEVICE_ID_REQUIRED: "Unable to identify your device. Please reload and try again.",
    SIGNUP_DEVICE_NOT_ALLOWED: "This device is not allowed to sign up. Contact your admin.",
    DB_NOT_READY: "The database is not ready. Please try again later.",
    ORG_CREATION_FAILED: "Could not create your workspace. Please try again.",
    USER_CREATION_FAILED: "Could not create your account. The username or email may already be in use.",
    TIMEOUT: "The server took too long to respond. Please try again.",
    SIGNUP_FAILED: "Sign up failed. Please try again later.",
  };
  if (map[key]) return map[key];
  if (key.startsWith("UNHANDLED_ERROR") || key.startsWith("SMTP_") || key.startsWith("HTTP_"))
    return "Something went wrong on our end. Please try again later.";
  if (raw.startsWith("{")) return "Something went wrong. Please try again later.";
  return raw;
};

export default function SignUp() {
  const navigate = useNavigate();
  const [allowed, setAllowed] = createSignal<boolean | null>(null);
  const [username, setUsername] = createSignal(localStorage.getItem("signup.username") ?? "");
  const [email, setEmail] = createSignal(localStorage.getItem("signup.email") ?? "");
  const [password, setPassword] = createSignal("");
  const [toast, setToast] = createSignal<ToastState>(null);
  let toastTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  const [busy, setBusy] = createSignal(false);

  const closeToast = () => {
    if (toastTimer) globalThis.clearTimeout(toastTimer);
    toastTimer = null;
    setToast(null);
  };
  const showToast = (kind: "success" | "error", message: string) => {
    if (toastTimer) globalThis.clearTimeout(toastTimer);
    toastTimer = null;
    setToast({ id: Date.now(), kind, message });
    toastTimer = globalThis.setTimeout(() => setToast(null), 5000);
  };
  const [checkingTooLong, setCheckingTooLong] = createSignal(false);
  const [touchedUsername, setTouchedUsername] = createSignal(false);
  const [touchedEmail, setTouchedEmail] = createSignal(false);
  const [touchedPassword, setTouchedPassword] = createSignal(false);
  const isUsernameValid = createMemo(() => username().trim().length >= 3);
  const isEmailValid = createMemo(() => /^\S+@\S+\.\S+$/.test(email().trim()));
  const isPasswordValid = createMemo(() => password().trim().length >= 8);
  const usernameError = createMemo(() =>
    touchedUsername() && !isUsernameValid() ? "Please fill in this field." : null,
  );
  const emailError = createMemo(() =>
    touchedEmail() && !isEmailValid() ? "Please fill in this field." : null,
  );
  const passwordError = createMemo(() =>
    touchedPassword() && !isPasswordValid() ? "Please fill in this field." : null,
  );
  const canSubmit = createMemo(
    () => !busy() && isUsernameValid() && isEmailValid() && isPasswordValid(),
  );

  onMount(() => {
    void (async () => {
      try {
        const slowTimer = setTimeout(() => setCheckingTooLong(true), 2500);
        const res = await api.get<{ allowed: boolean }>("/auth/signup-allowed");
        clearTimeout(slowTimer);
        setAllowed(res.allowed);
        if (!res.allowed) navigate("/sign-in", { replace: true });
      } catch {
        setAllowed(false);
        navigate("/sign-in", { replace: true });
      }
    })();
  });

  createEffect(() => {
    localStorage.setItem("signup.username", username());
  });
  createEffect(() => {
    localStorage.setItem("signup.email", email());
  });

  const onSubmit = async (e: Event) => {
    e.preventDefault();
    setTouchedUsername(true);
    setTouchedEmail(true);
    setTouchedPassword(true);
    if (!canSubmit()) return;
    closeToast();
    setBusy(true);
    try {
      const res = await api.post<{ ok: boolean; emailSent?: boolean }>("/auth/signup", {
        username: username(),
        email: email(),
        password: password(),
      });
      if (res.emailSent === false) {
        showToast("error", "Account created, but we couldn't send the verification email. Contact your admin.");
      } else {
        showToast("success", "Account created! Check your email for a verification link.");
      }
      localStorage.removeItem("signup.username");
      localStorage.removeItem("signup.email");
      setBusy(false);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "SIGNUP_FAILED";
      showToast("error", humanMessage(raw));
      setBusy(false);
    }
  };

  return (
    <Show
      when={allowed() !== null}
      fallback={
        <div class="shell">
          <div class="panel">
            <div class="panelInner">
              <div class="title">
                <h1>Checking Access…</h1>
                <p>Sign up is only visible to allow-listed devices.</p>
              </div>
              <div class="card">
                <div class="cardInner">
                  <div style="display: flex; gap: 10px; align-items: center; color: rgba(250,250,255,0.76); font-size: 14px">
                    <span class="spinner" />
                    <span>Please wait.</span>
                  </div>
                  {checkingTooLong() ? (
                    <div style="color: rgba(250,250,255,0.68); font-size: 13px; line-height: 1.5; margin-top: 10px">
                      Still waiting for the server. Make sure the backend is running on
                      http://localhost:3001.
                    </div>
                  ) : null}
                  <A class="pillLink" href="/sign-in">
                    Back to Sign In
                  </A>
                </div>
              </div>
            </div>
          </div>
        </div>
      }
    >
      <Show when={allowed() === true}>
        <div class="shell">
          <div class="panel">
            <div class="panelInner">
              <div class="title">
                <h1>Sign Up</h1>
                <p>
                  Access is restricted by device allow-list. If you reached this page, your device is
                  allowed.
                </p>
              </div>

              <div class="grid">
                <div class="card colSpan7">
                  <div class="cardInner">
                    <form
                      onSubmit={onSubmit}
                      class="grid"
                      style="grid-template-columns: repeat(12, 1fr); gap: 14px"
                    >
                      <div class="field colSpan12">
                        <label for="username">
                          Username<span class="fieldReq">*</span>
                        </label>
                        <input
                          id="username"
                          class={usernameError() ? "inputError" : undefined}
                          value={username()}
                          onInput={(e) => setUsername(e.currentTarget.value)}
                          onBlur={() => setTouchedUsername(true)}
                          autocomplete="username"
                        />
                        <Show when={usernameError()}>
                          <div class="fieldError">{usernameError()}</div>
                        </Show>
                      </div>
                      <div class="field colSpan12">
                        <label for="email">
                          Email<span class="fieldReq">*</span>
                        </label>
                        <input
                          id="email"
                          class={emailError() ? "inputError" : undefined}
                          value={email()}
                          onInput={(e) => setEmail(e.currentTarget.value)}
                          onBlur={() => setTouchedEmail(true)}
                          autocomplete="email"
                        />
                        <Show when={emailError()}>
                          <div class="fieldError">{emailError()}</div>
                        </Show>
                      </div>
                      <div class="field colSpan12">
                        <label for="password">
                          Password<span class="fieldReq">*</span>
                        </label>
                        <input
                          id="password"
                          type="password"
                          class={passwordError() ? "inputError" : undefined}
                          value={password()}
                          onInput={(e) => setPassword(e.currentTarget.value)}
                          onBlur={() => setTouchedPassword(true)}
                          autocomplete="new-password"
                        />
                        <Show when={passwordError()}>
                          <div class="fieldError">{passwordError()}</div>
                        </Show>
                      </div>
                      <div
                        class="colSpan12"
                        style="display: flex; gap: 10px; align-items: center; justify-content: space-between"
                      >
                        <button class="btn btnHero" type="submit" disabled={!canSubmit()}>
                          <span style="display: inline-flex; gap: 10px; align-items: center">
                            {busy() ? <span class="spinner" /> : null}
                            <span>{busy() ? "Working…" : "Sign Up"}</span>
                          </span>
                        </button>
                        <A class="pillLink" href="/sign-in">
                          Back to Sign In
                        </A>
                      </div>

                    </form>
                  </div>
                </div>

                <div class="card colSpan5">
                  <div class="cardInner">
                    <div style="display: grid; gap: 12px">
                      <div style="font-weight: 600; letter-spacing: -0.01em">Verification</div>
                      <div style="color: rgba(250,250,255,0.68); line-height: 1.5; font-size: 14px">
                        A verification link is emailed to you and expires in about 1 day. Until
                        verified, sign in is blocked.
                      </div>
                      <div style="height: 1px; background: rgba(255,255,255,0.12)" />
                      <div style="color: rgba(250,250,255,0.68); line-height: 1.5; font-size: 14px">
                        If you did not receive the email, check spam or contact your admin to re-issue a
                        link.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Show>
      <Toast toast={toast()} onClose={closeToast} />
    </Show>
  );
}
