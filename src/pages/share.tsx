import Dashboard from "@/pages/dashboard";
import { useParams } from "@solidjs/router";

export default function Share() {
  const params = useParams<{ token: string }>();
  return <Dashboard publicToken={params.token} />;
}
