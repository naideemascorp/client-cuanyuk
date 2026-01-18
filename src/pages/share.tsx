import { useParams } from "@solidjs/router";
import Dashboard from "./dashboard";

export default function Share() {
  const params = useParams<{ token: string }>();
  return <Dashboard publicToken={params.token} />;
}

