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

/**
 * Returns true if either IPv4 CIDR fully contains the other (including
 * identical prefixes). Returns false for IPv6 or unparseable inputs.
 */
export function cidrOverlaps(a: string, b: string): boolean {
  const ca = parseCidr4(a);
  const cb = parseCidr4(b);
  if (!ca || !cb) return false;
  return contains4(ca, cb) || contains4(cb, ca);
}

/**
 * Detects conflicts between user-editable routes and returns a map of
 * route id → { type, message } for icon and tooltip rendering.
 *
 * Case 1 (info)  — one user-created CIDR fully contains another.
 * Case 2 (warning) — a blackhole route and a gateway/interface route share
 *                    the exact same destination.
 */
export function detectConflicts(
  routes: Route[],
): Map<string, { type: "info" | "warning"; message: string }> {
  const result = new Map<string, { type: "info" | "warning"; message: string }>();

  const candidates = routes.filter((r) => r.is_editable);

  // Case 2 — Blackhole + gateway/interface with identical destination (warning)
  // Processed first so it takes priority; both routes in the pair are flagged.
  for (let i = 0; i < candidates.length; i++) {
    const a = candidates[i];
    if (a.nexthop_type !== "blackhole") continue;

    for (let j = 0; j < candidates.length; j++) {
      if (i === j) continue;
      const b = candidates[j];
      if (b.nexthop_type === "blackhole") continue;
      if (a.destination !== b.destination) continue;

      result.set(a.id, {
        type: "warning",
        message: `This blackhole route shares an identical destination with an active gateway route (${b.label} · ${b.destination}). Traffic to this destination may be silently dropped instead of reaching the intended gateway. Verify this is intentional.`,
      });
      result.set(b.id, {
        type: "warning",
        message: `This blackhole route shares an identical destination with an active gateway route (${a.label} · ${a.destination}). Traffic to this destination may be silently dropped instead of reaching the intended gateway. Verify this is intentional.`,
      });
    }
  }

  // Case 1 — General overlap (informational)
  // Flag only the later-created route in each overlapping pair.
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];

      if (a.destination === "0.0.0.0/0" || a.destination === "::/0") continue;
      if (b.destination === "0.0.0.0/0" || b.destination === "::/0") continue;
      // Skip valid ECMP pairs
      if (a.destination === b.destination && a.nexthop_type === b.nexthop_type) continue;

      const ca = parseCidr4(a.destination);
      const cb = parseCidr4(b.destination);
      if (!ca || !cb) continue;

      if (!contains4(ca, cb) && !contains4(cb, ca)) continue;

      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      const [later, earlier] = aTime >= bTime ? [a, b] : [b, a];

      // Only set info if no higher-priority warning already exists
      if (!result.has(later.id)) {
        result.set(later.id, {
          type: "info",
          message: `This route's address space overlaps with ${earlier.label} · ${earlier.destination}. This may be intentional but worth verifying.`,
        });
      }
    }
  }

  return result;
}
