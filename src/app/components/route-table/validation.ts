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

export function validateDestination(dest: string): string | null {
  if (!dest) return "Destination is required.";
  const v4 = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
  const v6 = /^[0-9a-fA-F:]+\/\d{1,3}$/;
  if (v4.test(dest)) {
    const [ip, lenStr] = dest.split("/");
    const len = Number(lenStr);
    if (len < 0 || len > 32) return "Invalid IPv4 prefix length.";
    if (ipv4ToInt(ip) == null) return "Invalid IPv4 address.";
    if (dest === VPC_PREFIX || isSubPrefixOfVpc(dest))
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
