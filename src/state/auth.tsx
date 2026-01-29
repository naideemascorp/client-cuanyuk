import { useToast } from "@/state/toast";
import { api } from "@/utils/api";
import { useLocation, useNavigate } from "@solidjs/router";
import { type JSX, createContext, createEffect, createSignal, onMount, useContext } from "solid-js";

type User = {
  id: string;
  username: string;
  email: string;
  organizationId: string;
  role: "USER" | "SUPER";
};

type AuthState = {
  me: () => User | null;
  shareUrl: () => string | null;
  loading: () => boolean;
  signIn: (identifier: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState>();

export const AuthProvider = (props: { children: JSX.Element }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [me, setMe] = createSignal<User | null>(null);
  const [shareUrl, setShareUrl] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(true);

  const fetchMe = async () => {
    let hadToken = false;
    try {
      hadToken = Boolean(localStorage.getItem("auth_token"));
    } catch {}
    try {
      const res = await api.get<{ user?: User; shareUrl?: string }>("/auth/me");
      const nextUser = res.user ?? null;
      setMe(nextUser);
      setShareUrl(res.shareUrl ?? null);
      if (!nextUser && hadToken) {
        try {
          localStorage.removeItem("auth_token");
        } catch {}
        toast.showToast("error", "Session expired. Please sign in again.");
      }
    } catch {
      setMe(null);
      setShareUrl(null);
      if (hadToken) {
        try {
          localStorage.removeItem("auth_token");
        } catch {}
        toast.showToast("error", "Session restore failed. Please sign in again.");
      }
    }
  };

  onMount(() => {
    void (async () => {
      try {
        setLoading(true);
        let hadToken = false;
        try {
          hadToken = Boolean(localStorage.getItem("auth_token"));
        } catch {}
        const path = location.pathname;
        const isPublic =
          ["/sign-in", "/sign-up", "/verify-email"].includes(path) ||
          path.startsWith("/reset-password/") ||
          path.startsWith("/share/");
        if (!hadToken && !isPublic) {
          setMe(null);
          setShareUrl(null);
          navigate("/sign-in", { replace: true });
          return;
        }
        let timer: ReturnType<typeof setTimeout> | null = null;
        timer =
          !isPublic || hadToken
            ? globalThis.setTimeout(() => {
                if (!loading()) return;
                setMe(null);
                setShareUrl(null);
                setLoading(false);
                if (hadToken) {
                  try {
                    localStorage.removeItem("auth_token");
                  } catch {}
                  toast.showToast("error", "Session restore timed out. Please sign in again.");
                }
                if (!isPublic) navigate("/sign-in", { replace: true });
              }, 25_000)
            : null;

        try {
          await fetchMe();
        } finally {
          if (timer) globalThis.clearTimeout(timer);
        }
      } finally {
        setLoading(false);
      }
    })();
  });

  createEffect(() => {
    const path = location.pathname;
    const current = me();
    const isPublic =
      ["/sign-in", "/sign-up", "/verify-email"].includes(path) ||
      path.startsWith("/reset-password/") ||
      path.startsWith("/share/");
    if (loading()) return;
    if (!current && !isPublic) navigate("/sign-in", { replace: true });
    if (current && ["/sign-in", "/sign-up"].includes(path)) navigate("/", { replace: true });
  });

  const signIn = async (identifier: string, password: string) => {
    setLoading(true);
    try {
      const res = await api.post<{ token?: string; user?: User }>("/auth/signin", {
        identifier,
        password,
      });
      if (res.token) {
        try {
          localStorage.setItem("auth_token", res.token);
        } catch {}
      }
      if (!res.token) throw new Error("SIGNIN_FAILED");
      await fetchMe();
      toast.showToast("success", "Signed in.");
      navigate("/", { replace: true });
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      await api.postNoJson("/auth/signout", null);
      setMe(null);
      setShareUrl(null);
      try {
        localStorage.removeItem("auth_token");
      } catch {}
      toast.showToast("success", "Signed out.");
      navigate("/sign-in", { replace: true });
    } finally {
      setLoading(false);
    }
  };

  const value: AuthState = { me, shareUrl, loading, signIn, signOut };
  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AuthContext missing");
  return ctx;
};
