import { Toaster } from "./components/ui/sonner";
import { RouteTablePage } from "./components/route-table/RouteTablePage";

export default function App() {
  return (
    <div className="size-full min-h-screen bg-slate-50">
      <RouteTablePage />
      <Toaster position="bottom-right" />
    </div>
  );
}