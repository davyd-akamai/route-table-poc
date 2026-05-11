import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "../ui/sheet";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Info } from "lucide-react";
import { Route, NexthopOption } from "./api";
import { validateLabel, validateDestination } from "./validation";

type Mode = "add" | "edit";

type Props = {
  open: boolean;
  mode: Mode;
  initial?: Route | null;
  nexthopOptions: NexthopOption[];
  blackholeCount: number;
  allRoutes: Route[];
  onClose: () => void;
  onSubmit: (payload: { label: string; destination: string; nexthop_type: string; nexthop: string | null }) => Promise<void>;
};

export function RouteDrawer({ open, mode, initial, nexthopOptions, blackholeCount, allRoutes, onClose, onSubmit }: Props) {
  const [label, setLabel] = useState("");
  const [destination, setDestination] = useState("");
  const [nexthopType, setNexthopType] = useState<"interface_id" | "gateway_id" | "blackhole">("interface_id");
  const [nexthop, setNexthop] = useState<string>("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setLabel(initial?.label ?? "");
      setDestination(initial?.destination ?? "");
      setNexthopType((initial?.nexthop_type as any) ?? "interface_id");
      setNexthop(initial?.nexthop ?? "");
      setSubmitError(null);
    }
  }, [open, initial]);

  const labelError = label ? validateLabel(label) : null;
  const destinationError = mode === "add" && destination ? validateDestination(destination) : null;

  const labelUniqueError = useMemo(() => {
    if (!label) return null;
    const duplicate = allRoutes.find(
      (r) =>
        r.label.toLowerCase() === label.toLowerCase() &&
        (mode === "add" || r.id !== initial?.id)
    );
    return duplicate
      ? `Label "${label}" is already in use. Choose a unique label.`
      : null;
  }, [label, allRoutes, mode, initial]);

  const filteredOptions = useMemo(
    () => nexthopOptions.filter((o) => o.type === nexthopType),
    [nexthopOptions, nexthopType],
  );

  const blackholeLimitHit = nexthopType === "blackhole" && blackholeCount >= 25 && mode === "add";

  const selectedNexthopCount = useMemo(() => {
    if (!nexthop || nexthopType === "blackhole") return 0;
    return allRoutes.filter(
      (r) => r.nexthop === nexthop && r.is_editable
    ).length;
  }, [nexthop, nexthopType, allRoutes]);

  const ifGwLimitHit =
    mode === "add" &&
    (nexthopType === "interface_id" ||
      nexthopType === "gateway_id") &&
    !!nexthop &&
    selectedNexthopCount >= 10;

  const formValid =
    !validateLabel(label) &&
    !labelUniqueError &&
    (mode === "edit" || !validateDestination(destination)) &&
    (nexthopType === "blackhole" || !!nexthop) &&
    !blackholeLimitHit &&
    !ifGwLimitHit;

  const handleSubmit = async () => {
    if (!formValid) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit({
        label,
        destination,
        nexthop_type: nexthopType,
        nexthop: nexthopType === "blackhole" ? null : nexthop,
      });
    } catch (e: any) {
      setSubmitError(e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const isBlackholeEdit = mode === "edit" && initial?.nexthop_type === "blackhole";

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[480px] sm:max-w-[480px] flex flex-col gap-0 p-0">
        <SheetHeader className="px-[25px] py-[20px] border-b">
          <SheetTitle style={{ fontSize: 17 }}>{mode === "add" ? "Add Route" : "Edit Route"}</SheetTitle>
          <SheetDescription style={{ fontSize: 13 }}>vpc-prod-us-east</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-[25px] py-[20px] flex flex-col gap-[20px]">
          {isBlackholeEdit ? (
            <Banner>
              Updating the next hop will attempt to restore this route to Active. The route will return to Blackhole if the target remains unreachable.
            </Banner>
          ) : (
            <Banner>
              To route traffic across multiple paths to the same destination, create separate routes with the same destination and different nexthops (ECMP).
            </Banner>
          )}

          <Field
            label="Label"
            helper="1–64 characters. Letters, numbers, and hyphens only. No consecutive dashes (e.g. rt-web-01)."
            error={labelUniqueError ?? labelError}
          >
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="rt-web-01" />
          </Field>

          <Field
            label="Destination CIDR"
            helper="Enter an IPv4 or IPv6 CIDR block"
            error={destinationError}
          >
            <Input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="e.g. 10.2.0.0/24 or 2001:db8::/32"
              disabled={mode === "edit"}
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            />
          </Field>

          <div className="flex flex-col gap-[10px]">
            <Label>Nexthop Type</Label>
            <div className="grid grid-cols-1 gap-[10px]">
              <NexthopCard
                selected={nexthopType === "interface_id"}
                onSelect={() => setNexthopType("interface_id")}
                title="Linode Interface"
                description="Route traffic to a Linode network interface"
              />
              <NexthopCard
                selected={nexthopType === "gateway_id"}
                onSelect={() => setNexthopType("gateway_id")}
                title="Gateway"
                description="Route traffic through a gateway resource"
              />
              <NexthopCard
                selected={nexthopType === "blackhole"}
                onSelect={() => setNexthopType("blackhole")}
                title="Blackhole"
                description="Silently drop all traffic to this destination"
              />
            </div>
          </div>

          {nexthopType !== "blackhole" && (
            <Field label="Nexthop" helper="">
              <Select value={nexthop} onValueChange={setNexthop}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      nexthopType === "interface_id" ? "Select a Linode interface" : "Select a gateway"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {filteredOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          {(blackholeLimitHit || ifGwLimitHit || submitError) && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700" style={{ fontSize: 13 }}>
              {blackholeLimitHit
                ? "Blackhole route limit reached (25 of 25 used). Delete an existing blackhole route to add a new one."
                : ifGwLimitHit
                ? `Route limit reached for ${nexthop}. This interface or gateway already has 10 routes assigned. Select a different nexthop or delete an existing route.`
                : submitError}
            </div>
          )}
        </div>

        <SheetFooter className="px-[25px] py-[15px] border-t flex-row justify-end gap-[10px]">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!formValid || submitting} className="bg-blue-600 hover:bg-blue-700 text-white">
            {submitting ? "Saving…" : mode === "add" ? "Add Route" : "Save Changes"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, helper, error, children }: { label: string; helper?: string; error?: string | null; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[6px]">
      <Label style={{ fontSize: 13 }}>{label}</Label>
      {children}
      {error ? (
        <span className="text-red-600" style={{ fontSize: 12 }}>{error}</span>
      ) : helper ? (
        <span className="text-slate-500" style={{ fontSize: 12 }}>{helper}</span>
      ) : null}
    </div>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-[10px] rounded-md border border-blue-200 bg-blue-50 px-3 py-2" style={{ fontSize: 13 }}>
      <Info className="size-4 text-blue-600 shrink-0 mt-0.5" />
      <span className="text-blue-900">{children}</span>
    </div>
  );
}

function NexthopCard({ selected, onSelect, title, description }: { selected: boolean; onSelect: () => void; title: string; description: string }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-left rounded-md border px-[15px] py-[10px] transition-colors ${
        selected ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <div style={{ fontSize: 13, fontWeight: 500 }}>{title}</div>
      <div className="text-slate-500 mt-0.5" style={{ fontSize: 12 }}>{description}</div>
    </button>
  );
}
