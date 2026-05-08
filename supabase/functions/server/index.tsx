import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";

const app = new Hono();

app.use("*", logger(console.log));
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

const ROUTE_PREFIX = "route:";
const NEXTHOP_PREFIX = "nexthop:";
const SEED_FLAG = "seed:routes:v4";

const SEED_ROUTES = [
  { id: "r-001", label: "rt-platform-default", destination: "0.0.0.0/0", nexthop_type: "platform", nexthop: "internet-gateway", mode: null, status: "active", is_editable: false },
  { id: "r-002", label: "rt-vpc-local", destination: "10.0.0.0/16", nexthop_type: "platform", nexthop: "local", mode: null, status: "active", is_editable: false },
  { id: "r-003", label: "rt-web-01", destination: "10.2.0.0/24", nexthop_type: "interface_id", nexthop: "if-7a3b9c1d", mode: "static", status: "active", is_editable: true },
  { id: "r-004", label: "rt-web-02", destination: "10.2.1.0/24", nexthop_type: "interface_id", nexthop: "if-91e2f4a8", mode: "static", status: "active", is_editable: true },
  { id: "r-005", label: "rt-app-primary", destination: "10.3.0.0/24", nexthop_type: "interface_id", nexthop: "if-44c8d2b1", mode: "static", status: "active", is_editable: true },
  { id: "r-006", label: "rt-app-secondary", destination: "10.3.0.0/24", nexthop_type: "interface_id", nexthop: "if-22a9e3f7", mode: "static", status: "active", is_editable: true },
  { id: "r-007", label: "rt-nat-egress", destination: "172.16.0.0/12", nexthop_type: "gateway_id", nexthop: "gw-nat-prod-01", mode: "static", status: "active", is_editable: true },
  { id: "r-008", label: "rt-partner-vpn", destination: "192.168.50.0/24", nexthop_type: "gateway_id", nexthop: "gw-vpn-partner", mode: "static", status: "active", is_editable: true },
  { id: "r-009", label: "rt-block-malicious", destination: "203.0.113.0/24", nexthop_type: "blackhole", nexthop: null, mode: null, status: "active", is_editable: true },
  { id: "r-010", label: "rt-block-spam", destination: "198.51.100.0/24", nexthop_type: "blackhole", nexthop: null, mode: null, status: "active", is_editable: true },
  { id: "r-011", label: "rt-bgp-peer-east", destination: "10.50.0.0/16", nexthop_type: "gateway_id", nexthop: "gw-bgp-east-01", mode: "bgp", status: "active", is_editable: false },
  { id: "r-012", label: "rt-bgp-peer-west", destination: "10.60.0.0/16", nexthop_type: "gateway_id", nexthop: "gw-bgp-west-01", mode: "bgp", status: "active", is_editable: false },
  { id: "r-013", label: "rt-db-cluster", destination: "10.4.0.0/24", nexthop_type: "interface_id", nexthop: "if-db-cluster-01", mode: "static", status: "active", is_editable: true },
];

const SEED_NEXTHOPS = [
  { id: "if-7a3b9c1d", label: "if-7a3b9c1d · linode-web-01", type: "interface_id" },
  { id: "if-91e2f4a8", label: "if-91e2f4a8 · linode-web-02", type: "interface_id" },
  { id: "if-44c8d2b1", label: "if-44c8d2b1 · linode-app-01", type: "interface_id" },
  { id: "if-22a9e3f7", label: "if-22a9e3f7 · linode-app-02", type: "interface_id" },
  { id: "if-db-cluster-01", label: "if-db-cluster-01 · linode-db-primary", type: "interface_id" },
  { id: "if-cache-01", label: "if-cache-01 · linode-redis-01", type: "interface_id" },
  { id: "gw-nat-prod-01", label: "gw-nat-prod-01 · NAT Gateway (prod)", type: "gateway_id" },
  { id: "gw-vpn-partner", label: "gw-vpn-partner · Partner VPN", type: "gateway_id" },
  { id: "gw-transit-01", label: "gw-transit-01 · Transit Gateway", type: "gateway_id" },
];

async function ensureSeed() {
  const flag = await kv.get(SEED_FLAG);
  console.log("[ensureSeed] current flag value:", flag);
  if (flag) return;

  console.log("[ensureSeed] flag missing — running seed with individual set calls");
  const now = new Date().toISOString();

  // Seed routes using individual kv.set calls
  console.log("[ensureSeed] seeding routes...");
  for (const route of SEED_ROUTES) {
    const routeData = { ...route, created_at: now, updated_at: now };
    await kv.set(`route:${route.id}`, routeData);
    console.log(`[ensureSeed] set route:${route.id}`);
  }
  console.log("[ensureSeed] all routes seeded");

  // Seed nexthop options using individual kv.set calls
  console.log("[ensureSeed] seeding nexthop options...");
  for (const nexthop of SEED_NEXTHOPS) {
    await kv.set(`nexthop:${nexthop.id}`, nexthop);
    console.log(`[ensureSeed] set nexthop:${nexthop.id}`);
  }
  console.log("[ensureSeed] all nexthop options seeded");

  await kv.set(SEED_FLAG, true);
  console.log("[ensureSeed] seed flag written, seeding complete");
}

app.get("/make-server-22ead257/health", (c) => c.json({ status: "ok" }));

app.post("/make-server-22ead257/reseed", async (c) => {
  try {
    console.log("[/reseed] clearing seed flag and existing seed rows");
    await kv.del(SEED_FLAG);
    const existingRoutes = await kv.getByPrefix(ROUTE_PREFIX);
    const existingNexthops = await kv.getByPrefix(NEXTHOP_PREFIX);
    console.log("[/reseed] existing routes:", existingRoutes.length, "nexthops:", existingNexthops.length);
    await ensureSeed();
    const routes = await kv.getByPrefix(ROUTE_PREFIX);
    const nexthops = await kv.getByPrefix(NEXTHOP_PREFIX);
    return c.json({ ok: true, routes: routes.length, nexthops: nexthops.length });
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.log("[/reseed] error:", msg, e);
    return c.json({ error: `Reseed failed: ${msg}` }, 500);
  }
});

app.get("/make-server-22ead257/routes", async (c) => {
  try {
    await ensureSeed();
    const rows = await kv.getByPrefix(ROUTE_PREFIX);
    console.log("[GET /routes] raw kv rows:", JSON.stringify(rows));
    const safeRows = Array.isArray(rows) ? rows : [];
    safeRows.sort((a: any, b: any) => (a?.created_at < b?.created_at ? -1 : 1));
    return c.json({ routes: safeRows });
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.log("GET /routes error:", msg, e);
    return c.json({ error: `Supabase routes query failed: ${msg}` }, 500);
  }
});

app.get("/make-server-22ead257/nexthop-options", async (c) => {
  try {
    await ensureSeed();
    const rows = await kv.getByPrefix(NEXTHOP_PREFIX);
    rows.sort((a: any, b: any) =>
      a.type === b.type ? a.label.localeCompare(b.label) : a.type.localeCompare(b.type),
    );
    return c.json({ options: rows });
  } catch (e) {
    console.log("GET /nexthop-options error:", e);
    return c.json({ error: `Failed to load nexthop options: ${e}` }, 500);
  }
});

app.post("/make-server-22ead257/routes", async (c) => {
  try {
    const body = await c.req.json();
    const { label, destination, nexthop_type, nexthop } = body;

    const all = await kv.getByPrefix(ROUTE_PREFIX);
    const blackholeCount = all.filter((r: any) => r.nexthop_type === "blackhole" && r.is_editable).length;
    const ifGwCount = all.filter((r: any) => ["interface_id", "gateway_id"].includes(r.nexthop_type) && r.is_editable).length;

    if (nexthop_type === "blackhole" && blackholeCount >= 25) {
      return c.json({ error: "Blackhole route limit reached (25 of 25 used). Delete an existing blackhole route to add a new one." }, 400);
    }
    if (["interface_id", "gateway_id"].includes(nexthop_type) && ifGwCount >= 10) {
      return c.json({ error: "Interface and gateway route limit reached for one or more Linode interfaces. Review existing routes before adding new ones." }, 400);
    }

    const conflict = all.find(
      (r: any) =>
        r.destination === destination &&
        r.nexthop_type === nexthop_type &&
        (r.nexthop ?? null) === (nexthop ?? null),
    );
    if (conflict) {
      return c.json({ error: "A route with this destination and nexthop combination already exists." }, 409);
    }

    const id = `r-${Math.random().toString(36).slice(2, 10)}`;
    const now = new Date().toISOString();
    const newRoute = {
      id,
      label,
      destination,
      nexthop_type,
      nexthop: nexthop ?? null,
      mode: nexthop_type === "blackhole" ? null : "static",
      status: "active",
      is_editable: true,
      created_at: now,
      updated_at: now,
    };
    await kv.set(`${ROUTE_PREFIX}${id}`, newRoute);
    return c.json({ route: newRoute });
  } catch (e) {
    console.log("POST /routes error:", e);
    return c.json({ error: `Failed to create route: ${e}` }, 500);
  }
});

app.put("/make-server-22ead257/routes/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const existing = await kv.get(`${ROUTE_PREFIX}${id}`);
    if (!existing) return c.json({ error: "Route not found" }, 404);
    if (!existing.is_editable) return c.json({ error: "Route is not editable" }, 403);

    const updated = {
      ...existing,
      label: body.label ?? existing.label,
      nexthop_type: body.nexthop_type ?? existing.nexthop_type,
      nexthop: body.nexthop ?? null,
      mode: (body.nexthop_type ?? existing.nexthop_type) === "blackhole" ? null : "static",
      updated_at: new Date().toISOString(),
    };
    await kv.set(`${ROUTE_PREFIX}${id}`, updated);
    return c.json({ route: updated });
  } catch (e) {
    console.log("PUT /routes/:id error:", e);
    return c.json({ error: `Failed to update route: ${e}` }, 500);
  }
});

app.delete("/make-server-22ead257/routes/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const existing = await kv.get(`${ROUTE_PREFIX}${id}`);
    if (!existing) return c.json({ error: "Route not found" }, 404);
    if (!existing.is_editable) return c.json({ error: "Route is not editable" }, 403);
    await kv.del(`${ROUTE_PREFIX}${id}`);
    return c.json({ ok: true });
  } catch (e) {
    console.log("DELETE /routes/:id error:", e);
    return c.json({ error: `Failed to delete route: ${e}` }, 500);
  }
});

Deno.serve(app.fetch);
