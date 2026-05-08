import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, DollarSign, Lock, Pencil, Search, Trash2, AlertTriangle, Plus } from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog";
import { api, Route, NexthopOption } from "./api";
import { RouteDrawer } from "./RouteDrawer";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const LOCAL_HIDDEN_COUNT = 12;

const LOCAL_ROUTES = [
  { id: "local-1", label: "SM-L01", destination: "10.0.0.1/32" },
  { id: "local-2", label: "SM-L02", destination: "10.0.0.2/32" },
  { id: "local-3", label: "SM-L03", destination: "10.0.0.3/32" },
  { id: "local-4", label: "SM-L04", destination: "10.0.0.4/32" },
];

type FilterType = "all" | "interface_id" | "gateway_id" | "blackhole" | "platform" | "bgp";

export function RouteTablePage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [nexthops, setNexthops] = useState<NexthopOption[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [showLocal, setShowLocal] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"add" | "edit">("add");
  const [drawerInitial, setDrawerInitial] = useState<Route | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Route | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  async function load() {
    try {
      let [r, n] = await Promise.all([api.listRoutes(), api.listNexthops()]);
      if ((!Array.isArray(r) || r.length === 0) || (!Array.isArray(n) || n.length === 0)) {
        console.log("[load] empty data, triggering /reseed");
        try {
          const reseedRes = await api.reseed();
          console.log("[load] reseed result:", reseedRes);
        } catch (e) {
          console.log("[load] reseed failed:", e);
        }
        [r, n] = await Promise.all([api.listRoutes(), api.listNexthops()]);
      }
      setRoutes(Array.isArray(r) ? r : []);
      setNexthops(Array.isArray(n) ? n : []);
      setLoadError(null);
    } catch (e: any) {
      console.log("Load error:", e);
      setLoadError(e?.message ?? "Unable to load routes. Check your connection and try again.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const blackholeCount = routes.filter((r) => r.nexthop_type === "blackhole" && r.is_editable).length;
  const systemCount = routes.filter((r) => !r.is_editable).length;
  const ifGwCount = routes.filter((r) => ["interface_id", "gateway_id"].includes(r.nexthop_type) && r.is_editable).length;

  const ifGwWarnings = useMemo(() => {
    const counts = new Map<string, number>();
    routes.forEach((r) => {
      if (r.is_editable && (r.nexthop_type === "interface_id" || r.nexthop_type === "gateway_id")) {
        counts.set(r.nexthop, (counts.get(r.nexthop) ?? 0) + 1);
      }
    });
    const labelOf = (val: string) =>
      nexthops.find((n) => n.value === val)?.label ?? val;
    return Array.from(counts.entries())
      .filter(([, c]) => c >= 8)
      .map(([val, c]) => ({ label: labelOf(val), count: c }));
  }, [routes, nexthops]);

  const filtered = useMemo(() => {
    let list = Array.isArray(routes) ? routes : [];
    if (filter === "bgp") list = list.filter((r) => r.mode === "bgp");
    else if (filter !== "all") list = list.filter((r) => r.nexthop_type === filter);
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (r) =>
          r.destination.toLowerCase().includes(q) ||
          (r.label ?? "").toLowerCase().includes(q) ||
          (r.nexthop ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [routes, filter, debouncedSearch]);

  const ecmpDestinations = useMemo(() => {
    const counts = new Map<string, number>();
    routes.forEach((r) => counts.set(r.destination, (counts.get(r.destination) ?? 0) + 1));
    return new Set(Array.from(counts.entries()).filter(([, c]) => c > 1).map(([d]) => d));
  }, [routes]);

  const handleAdd = () => {
    setDrawerMode("add");
    setDrawerInitial(null);
    setDrawerOpen(true);
  };
  const handleEdit = (r: Route) => {
    setDrawerMode("edit");
    setDrawerInitial(r);
    setDrawerOpen(true);
  };

  const handleSubmit = async (payload: any) => {
    if (drawerMode === "add") {
      await api.createRoute(payload);
      toast.success("Route added successfully.");
    } else if (drawerInitial) {
      await api.updateRoute(drawerInitial.id, payload);
      toast.success("Route updated successfully.");
    }
    setDrawerOpen(false);
    await load();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteRoute(deleteTarget.id);
      toast.success("Route deleted.");
      setDeleteTarget(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete route.");
    }
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="mx-auto max-w-[1280px] px-[35px] py-[25px] flex flex-col gap-[20px]">
        {/* Header */}
        <div className="flex flex-col gap-[5px]">
          <div style={{ fontSize: 22, fontWeight: 500 }}>vpc-prod-us-east</div>
          <div className="flex items-center gap-[10px] text-slate-600" style={{ fontSize: 13 }}>
            <span>us-east (Newark)</span>
            <span className="text-slate-300">·</span>
            <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100" style={{ fontSize: 12 }}>
              <span className="size-1.5 rounded-full bg-green-500 mr-1" />
              Active
            </Badge>
            <span className="text-slate-300">·</span>
            <span className="text-slate-500">VPC · <span style={{ fontFamily: MONO }}>10.0.0.0/16</span></span>
          </div>
        </div>

        {/* Summary block */}
        <div className="rounded-lg border border-slate-200 bg-white px-[25px] py-[20px]">
          <div className="flex items-center justify-between mb-[15px]">
            <div style={{ fontSize: 15, fontWeight: 500 }}>Summary</div>
            <div className="flex items-center gap-[15px]">
              <button className="text-blue-600 hover:underline" style={{ fontSize: 13 }}>Edit</button>
              <button className="text-blue-600 hover:underline" style={{ fontSize: 13 }}>Delete</button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-y-[10px]" style={{ fontSize: 13 }}>
            <SummaryItem k="Subnets" v="2" />
            <SummaryItem k="Region" v="DE, Frankfurt 2" />
            <SummaryItem k="Created" v="2026-04-10T11:18:45" mono />
            <SummaryItem k="Resources" v="3" />
            <SummaryItem k="VPC ID" v="448158" mono />
            <SummaryItem k="Updated" v="2026-04-10T11:18:45" mono />
          </div>
        </div>

        {/* Tabs */}
        <Tabs value="route-table">
          <TabsList className="bg-transparent p-0 h-auto border-b border-slate-200 rounded-none w-full justify-start gap-[5px]">
            <TabsTrigger value="subnets" className="flex-none rounded-none border-0 border-b-2 border-b-transparent data-[state=active]:border-b-blue-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-[15px] py-[10px]">Subnets</TabsTrigger>
            <TabsTrigger value="route-table" className="flex-none rounded-none border-0 border-b-2 border-b-transparent data-[state=active]:border-b-blue-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-[15px] py-[10px]">Route Table</TabsTrigger>
          </TabsList>
        </Tabs>

        {loadError && (
          <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700" style={{ fontSize: 13 }}>
            <div className="flex items-center gap-2"><AlertCircle className="size-4" /> {loadError}</div>
            <button onClick={load} className="text-red-700 underline">Retry</button>
          </div>
        )}

        {/* Limits card */}
        <div className="rounded-lg border border-slate-200 bg-white px-[25px] py-[20px]">
          <div className="grid grid-cols-3 gap-[35px]">
            <LimitCounter
              label="Blackhole Routes"
              value={blackholeCount}
              limit={25}
            />
            <Counter label="System Routes" value={systemCount} helper="Platform-managed" />
            <Counter
              label="Interface / Gateway Routes"
              value={ifGwCount}
              warnings={ifGwWarnings}
            />
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-[15px]">
          <div className="flex items-center gap-[10px] flex-1">
            <div className="relative max-w-[280px] flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by destination, label, or nexthop…"
                className="pl-8 bg-white border border-gray-300"
              />
            </div>
            <Select value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
              <SelectTrigger className="w-[180px] bg-white border border-gray-300"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="interface_id">Interface</SelectItem>
                <SelectItem value="gateway_id">Gateway</SelectItem>
                <SelectItem value="blackhole">Blackhole</SelectItem>
                <SelectItem value="platform">Platform</SelectItem>
                <SelectItem value="bgp">BGP</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-[8px]">
              <Switch id="show-local" checked={showLocal} onCheckedChange={setShowLocal} />
              <Label htmlFor="show-local" className="text-slate-700" style={{ fontSize: 13 }}>
                {showLocal ? "Hide local routes" : `Show local routes (${LOCAL_HIDDEN_COUNT})`}
              </Label>
            </div>
          </div>
          <Button onClick={handleAdd} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="size-4 mr-1" /> Add Route
          </Button>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <table className="w-full" style={{ fontSize: 13 }}>
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-slate-600" style={{ fontSize: 12 }}>
                <Th>Label</Th>
                <Th>Destination</Th>
                <Th>Nexthop Type</Th>
                <Th>Mode</Th>
                <Th>Next Hop</Th>
                <Th className="text-right pr-[20px]">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-[60px]">
                    <div className="flex flex-col items-center gap-[10px] text-slate-500">
                      <Search className="size-6 text-slate-400" />
                      <div style={{ fontSize: 15, fontWeight: 500, color: "#0f172a" }}>No routes found</div>
                      <div style={{ fontSize: 13 }}>
                        {debouncedSearch
                          ? `No routes match '${debouncedSearch}'. Try a different destination.`
                          : "No routes match the current filter."}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.flatMap((r) => {
                  const rows = [
                    <RouteRow
                      key={r.id}
                      route={r}
                      isEcmp={ecmpDestinations.has(r.destination)}
                      onEdit={() => handleEdit(r)}
                      onDelete={() => setDeleteTarget(r)}
                    />,
                  ];
                  if (
                    showLocal &&
                    r.destination === "10.0.0.0/16" &&
                    r.nexthop_type === "platform"
                  ) {
                    LOCAL_ROUTES.forEach((local) => {
                      rows.push(
                        <tr key={local.id} className="border-b border-slate-100 bg-slate-100/70">
                          <td className="pl-[35px] py-[12px]" style={{ fontFamily: MONO }}>{local.label}</td>
                          <td className="py-[12px]" style={{ fontFamily: MONO }}>{local.destination}</td>
                          <td className="py-[12px]">
                            <Badge variant="outline" className="bg-slate-100 border-slate-200 text-slate-700 gap-1">
                              <Lock className="size-3" /> Platform
                            </Badge>
                          </td>
                          <td className="py-[12px] text-slate-400">—</td>
                          <td className="py-[12px] text-slate-500">local (VPC)</td>
                          <td className="py-[12px] pr-[20px] text-right">
                            <LockedActions kind="platform" />
                          </td>
                        </tr>,
                      );
                    });
                    rows.push(
                      <tr key="local-note" className="bg-slate-50/60">
                        <td colSpan={6} className="pl-[35px] py-[8px] text-slate-500" style={{ fontSize: 12 }}>
                          Showing 4 of 12 local routes
                        </td>
                      </tr>,
                    );
                  }
                  return rows;
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="text-slate-500" style={{ fontSize: 12 }}>
          Showing {filtered.length} routes ·{" "}
          {showLocal ? "local routes visible" : "12 platform local routes hidden"}
        </div>
      </div>

      <RouteDrawer
        open={drawerOpen}
        mode={drawerMode}
        initial={drawerInitial}
        nexthopOptions={nexthops}
        blackholeCount={blackholeCount}
        ifGwCount={ifGwCount}
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleSubmit}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Route</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the route to{" "}
              <span style={{ fontFamily: MONO }}>{deleteTarget?.destination}</span>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700 text-white">
              Delete Route
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}

function SummaryItem({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex gap-[10px]">
      <span style={{ fontWeight: 500 }}>{k}</span>
      <span className="text-slate-700" style={{ fontFamily: mono ? MONO : undefined }}>{v}</span>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-[15px] py-[10px] font-medium ${className ?? ""}`}>{children}</th>;
}

function Counter({ label, value, helper, warnings }: { label: string; value: number; helper?: string; warnings?: { label: string; count: number }[] }) {
  const showWarn = warnings && warnings.length > 0;
  return (
    <div className="flex flex-col gap-[5px]">
      <div className="text-slate-600" style={{ fontSize: 12 }}>{label}</div>
      <div className="flex items-center gap-[8px]">
        <div style={{ fontSize: 22, fontWeight: 500 }}>{value}</div>
        {showWarn && (
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertTriangle className="size-4 text-amber-500" />
            </TooltipTrigger>
            <TooltipContent className="max-w-[280px]">
              <div className="flex flex-col gap-[4px]">
                {warnings!.map((w) => (
                  <div key={w.label}>
                    {w.label} is approaching the limit ({w.count} / 10 routes). Review your routes to avoid hitting the limit.
                  </div>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      {helper && <div className="text-slate-500" style={{ fontSize: 12 }}>{helper}</div>}
    </div>
  );
}

function LimitCounter({ label, value, limit }: { label: string; value: number; limit: number }) {
  return (
    <div className="flex flex-col gap-[5px]">
      <div className="text-slate-600" style={{ fontSize: 12 }}>{label}</div>
      <div className="flex items-baseline gap-[6px]">
        <span style={{ fontSize: 22, fontWeight: 500 }}>{value}</span>
        <span className="text-slate-400" style={{ fontSize: 13 }}>/ {limit}</span>
      </div>
    </div>
  );
}

function RouteRow({ route, isEcmp, onEdit, onDelete }: { route: Route; isEcmp: boolean; onEdit: () => void; onDelete: () => void }) {
  const readOnly = !route.is_editable;
  return (
    <tr className={`border-b border-slate-100 last:border-b-0 ${readOnly ? "bg-slate-100/70" : ""}`}>
      <td className="px-[15px] py-[12px]" style={{ fontFamily: MONO }}>{route.label}</td>
      <td className="px-[15px] py-[12px]" style={{ fontFamily: MONO }}>{route.destination}</td>
      <td className="px-[15px] py-[12px]">
        <div className="flex items-center gap-[6px]">
          <NexthopTypeBadge route={route} />
          {isEcmp && route.destination === "10.3.0.0/24" && (
            <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700" style={{ fontSize: 11 }}>ECMP</Badge>
          )}
        </div>
      </td>
      <td className="px-[15px] py-[12px]"><ModeBadge mode={route.mode} /></td>
      <td className="px-[15px] py-[12px]"><NexthopCell route={route} /></td>
      <td className="px-[15px] py-[12px] pr-[20px] text-right">
        {readOnly ? (
          <LockedActions kind={route.mode === "bgp" ? "bgp" : "platform"} />
        ) : (
          <div className="inline-flex items-center gap-[5px]">
            <button onClick={onEdit} className="rounded p-1 text-slate-600 hover:bg-slate-100" aria-label="Edit"><Pencil className="size-4" /></button>
            <button onClick={onDelete} className="rounded p-1 text-slate-600 hover:bg-red-50 hover:text-red-600" aria-label="Delete"><Trash2 className="size-4" /></button>
          </div>
        )}
      </td>
    </tr>
  );
}

function NexthopTypeBadge({ route }: { route: Route }) {
  const type = route.nexthop_type;
  if (type === "blackhole") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">Blackhole</Badge>
        </TooltipTrigger>
        <TooltipContent>Drops all traffic to this destination.</TooltipContent>
      </Tooltip>
    );
  }
  if (type === "platform") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="bg-slate-100 border-slate-200 text-slate-700 gap-1">
            <Lock className="size-3" /> Platform
          </Badge>
        </TooltipTrigger>
        <TooltipContent>Managed by the platform. Cannot be edited or deleted.</TooltipContent>
      </Tooltip>
    );
  }
  if (type === "gateway_id") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="bg-slate-100 border-slate-200 text-slate-700">Gateway</Badge>
        </TooltipTrigger>
        <TooltipContent>Routes traffic through a gateway resource, such as a NAT Gateway.</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="bg-slate-100 border-slate-200 text-slate-700">Interface</Badge>
      </TooltipTrigger>
      <TooltipContent>Routes traffic to a specific Linode network interface within this VPC.</TooltipContent>
    </Tooltip>
  );
}

function ModeBadge({ mode }: { mode: Route["mode"] }) {
  if (mode === "static")
    return <Badge className="bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100">Static</Badge>;
  if (mode === "bgp")
    return <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 hover:bg-indigo-100">BGP</Badge>;
  return <span className="text-slate-400">—</span>;
}

function NexthopCell({ route }: { route: Route }) {
  if (route.nexthop_type === "blackhole")
    return <span className="italic text-slate-500">Traffic silently dropped</span>;
  if (route.nexthop_type === "platform") {
    if (route.nexthop === "internet-gateway")
      return (
        <span className="inline-flex items-center gap-[6px]">
          <span>Internet gateway</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <DollarSign className="size-3.5 text-slate-500" />
            </TooltipTrigger>
            <TooltipContent>Egress traffic via this route is billed.</TooltipContent>
          </Tooltip>
        </span>
      );
    if (route.nexthop === "local") return <span className="text-slate-500">local (VPC)</span>;
  }
  return <span style={{ fontFamily: MONO }}>{route.nexthop}</span>;
}

function LockedActions({ kind }: { kind: "platform" | "bgp" }) {
  const msg =
    kind === "bgp"
      ? "This route is dynamically learned via BGP and cannot be modified or deleted."
      : "This route is managed by the platform and cannot be modified or deleted.";
  return (
    <div className="flex items-center justify-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center justify-center text-slate-500 cursor-default">
            <Lock className="size-4" />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[260px]">{msg}</TooltipContent>
      </Tooltip>
    </div>
  );
}
