import { Toast } from "@/components/toast";
import { useToast } from "@/state/toast";

export function ToastHost() {
  const t = useToast();
  return <Toast toast={t.toast()} onClose={t.closeToast} />;
}
