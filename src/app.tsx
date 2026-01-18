import { Route, Router } from "@solidjs/router";
import { lazy } from "solid-js";
import { AuthProvider } from "./state/auth";
import { Footer } from "./components/footer";

const SignIn = lazy(() => import("./pages/sign-in"));
const SignUp = lazy(() => import("./pages/sign-up"));
const VerifyEmail = lazy(() => import("./pages/verify-email"));
const Dashboard = lazy(() => import("./pages/dashboard"));
const Share = lazy(() => import("./pages/share"));
const Admin = lazy(() => import("./pages/admin"));
const ResetPassword = lazy(() => import("./pages/reset-password"));

export const App = () => (
  <Router
    root={(props) => (
      <AuthProvider>
        <div class="appRoot">
          <div class="appMain">{props.children}</div>
          <Footer />
        </div>
      </AuthProvider>
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
