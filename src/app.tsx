import { Footer } from "@/components/footer";
import { ToastHost } from "@/components/toast-host";
import { AuthProvider } from "@/state/auth";
import { NotificationsProvider } from "@/state/notifications";
import { ToastProvider } from "@/state/toast";
import { Route, Router, useLocation, useNavigate } from "@solidjs/router";
import { createEffect, lazy } from "solid-js";

const SignIn = lazy(() => import("@/pages/sign-in"));
const SignUp = lazy(() => import("@/pages/sign-up"));
const VerifyEmail = lazy(() => import("@/pages/verify-email"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Share = lazy(() => import("@/pages/share"));
const Admin = lazy(() => import("@/pages/admin"));
const ResetPassword = lazy(() => import("@/pages/reset-password"));

const RedirectShim = () => {
  const navigate = useNavigate();
  const location = useLocation();
  createEffect(() => {
    const search = location.search ?? globalThis.location.search;
    const sp = new URLSearchParams(search);
    const raw = sp.get("__redirect");
    if (!raw) return;
    sp.delete("__redirect");
    const target = decodeURIComponent(raw);
    navigate(target, { replace: true });
  });
  return null;
};

export const App = () => (
  <Router
    root={(props) => (
      <ToastProvider>
        <AuthProvider>
          <NotificationsProvider>
            <div class="appRoot">
              <RedirectShim />
              <div class="appMain">{props.children}</div>
              <Footer />
              <ToastHost />
            </div>
          </NotificationsProvider>
        </AuthProvider>
      </ToastProvider>
    )}
  >
    <Route path="/" component={Dashboard} />
    <Route path="/sign-in" component={SignIn} />
    <Route path="/sign-up" component={SignUp} />
    <Route path="/verify-email" component={VerifyEmail} />
    <Route path="/share/:token" component={Share} />
    <Route path="/reset-password/:token" component={ResetPassword} />
    <Route path="/admin/ips" component={Admin} />
    <Route path="/admin" component={Admin} />
  </Router>
);
