import { Route } from "./api";

export const LABEL_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/;

export function validateLabel(label: string): string | null {
  if (!label) return "Label is required.";
  if (label.length < 1 || label.length > 64)
    return "Label must be 1–64 characters. Only letters, numbers, and hyphens allowed. Consecutive dashes are not permitted.";
  if (!LABEL_RE.test(label))
    return "Label must be 1–64 characters. Only letters, numbers, and hyphens allowed. Consecutive dashes are not permitted.";
  if (label.includes("--"))
    return "Label must be 1–64 characters. Only letters, numbers, and hyphens allowed. Consecutive dashes are not permitted.";
  return null;
}

const VPC_PREFIX = "10.0.0.0/16";

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function isSubPrefixOfVpc(cidr: string): boolean {
  const [ip, lenStr] = cidr.split("/");
  const len = Number(lenStr);
  const a = ipv4ToInt(ip);
  const b = ipv4ToInt("10.0.0.0");
  if (a == null || b == null || isNaN(len)) return false;
  if (len < 16) return false;
  const mask = len === 0 ? 0 : (~0 << (32 - 16)) >>> 0;
  return (a & mask) === (b & mask);
}

function isSupernetOfVpc(cidr: string): boolean {
  const [ip, lenStr] = cidr.split("/");
  const len = Number(lenStr);
  const a = ipv4ToInt(ip);
  const vpcBase = ipv4ToInt("10.0.0.0");
  if (a == null || vpcBase == null || isNaN(len)) return false;
  if (len >= 16) return false;
  const mask = len === 0 ? 0 : (~0 << (32 - len)) >>> 0;
  return (vpcBase & mask) === (a & mask);
}

export function validateDestination(dest: string): string | null {
  if (!dest) return "Destination is required.";
  const v4 = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
  const v6 = /^[0-9a-fA-F:]+\/\d{1,3}$/;
  if (v4.test(dest)) {
    const [ip, lenStr] = dest.split("/");
    const len = Number(lenStr);
    if (len < 0 || len > 32) return "Invalid IPv4 prefix length.";
    if (ipv4ToInt(ip) == null) return "Invalid IPv4 address.";
    if (dest === VPC_PREFIX || isSubPrefixOfVpc(dest) ||
        isSupernetOfVpc(dest))
      return "This destination overlaps with the VPC address space and cannot be used as a custom route.";
    return null;
  }
  if (v6.test(dest)) {
    const len = Number(dest.split("/")[1]);
    if (len < 0 || len > 128) return "Invalid IPv6 prefix length.";
    return null;
  }
  return "Enter a valid IPv4 or IPv6 CIDR (e.g. 10.2.0.0/24).";
}

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

function parseCidr4(cidr: string): { base: number; len: number } | null {
  const parts = cidr.split("/");
  if (parts.length !== 2) return null;
  const len = Number(parts[1]);
  if (isNaN(len) || len < 0 || len > 32) return null;
  const base = ipv4ToInt(parts[0]);
  if (base === null) return null;
  const mask = len === 0 ? 0 : (~0 << (32 - len)) >>> 0;
  return { base: (base & mask) >>> 0, len };
}

function contains4(
  outer: { base: number; len: number },
  inner: { base: number; len: number },
): boolean {
  if (outer.len > inner.len) return false;
  const mask = outer.len === 0 ? 0 : (~0 << (32 - outer.len)) >>> 0;
  return ((inner.base & mask) >>> 0) === outer.base;
}

function endOf4(c: { base: number; len: number }): number {
  const hostBits = 32 - c.len;
  const hostMask = c.len === 32 ? 0 : (~0 >>> c.len) >>> 0;
  return (c.base | hostMask) >>> 0;
}

/**
 * Detects conflicts between editable, non-BGP routes and returns a map of
 * route id → human-readable conflict description for the tooltip.
 */
export function detectConflicts(routes: Route[]): Map<string, string> {
  const result = new Map<string, string>();

  const candidates = routes.filter((r) => r.is_editable && r.mode !== "bgp");

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];

      // Skip ECMP pairs (same destination, same nexthop_type — intentional)
      if (a.destination === b.destination && a.nexthop_type === b.nexthop_type) continue;

      const ca = parseCidr4(a.destination);
      const cb = parseCidr4(b.destination);
      if (!ca || !cb) continue; // Skip IPv6 or invalid CIDRs

      const aContainsB = contains4(ca, cb);
      const bContainsA = contains4(cb, ca);
      const doOverlap =
        aContainsB || bContainsA || (ca.base <= endOf4(cb) && cb.base <= endOf4(ca));

      if (!doOverlap) continue;

      const aIsBlackhole = a.nexthop_type === "blackhole";
      const bIsBlackhole = b.nexthop_type === "blackhole";
      const aIsGateway =
        a.nexthop_type === "interface_id" || a.nexthop_type === "gateway_id";
      const bIsGateway =
        b.nexthop_type === "interface_id" || b.nexthop_type === "gateway_id";

      // Type 3 — Blackhole overlapping with a gateway/interface route
      if (aIsBlackhole && bIsGateway && !result.has(a.id)) {
        result.set(
          a.id,
          `This blackhole route overlaps with an active gateway route (${b.label} · ${b.destination}). Traffic matching this destination may be silently dropped instead of reaching the intended gateway. Verify route priority is correct.`,
        );
      }
      if (bIsBlackhole && aIsGateway && !result.has(b.id)) {
        result.set(
          b.id,
          `This blackhole route overlaps with an active gateway route (${a.label} · ${a.destination}). Traffic matching this destination may be silently dropped instead of reaching the intended gateway. Verify route priority is correct.`,
        );
      }

      // Type 1 — Broader route shadowed by more specific
      if (aContainsB && !bContainsA && !result.has(a.id)) {
        result.set(
          a.id,
          `This route is shadowed by a more specific route (${b.label} · ${b.destination}). Traffic matching both destinations will always use the more specific route. This route will only be used for destinations not covered by ${b.destination}.`,
        );
      }
      if (bContainsA && !aContainsB && !result.has(b.id)) {
        result.set(
          b.id,
          `This route is shadowed by a more specific route (${a.label} · ${a.destination}). Traffic matching both destinations will always use the more specific route. This route will only be used for destinations not covered by ${a.destination}.`,
        );
      }

      // Type 2 — Overlapping but neither fully contains the other
      if (!aContainsB && !bContainsA) {
        if (!result.has(a.id)) {
          result.set(
            a.id,
            `This route's destination overlaps with ${b.label} · ${b.destination}. Depending on the destination IP, traffic may match either route. Verify that both routes are intentional.`,
          );
        }
        if (!result.has(b.id)) {
          result.set(
            b.id,
            `This route's destination overlaps with ${a.label} · ${a.destination}. Depending on the destination IP, traffic may match either route. Verify that both routes are intentional.`,
          );
        }
      }
    }
  }

  return result;
}
