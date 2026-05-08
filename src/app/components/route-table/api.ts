import { supabaseUrl, publicAnonKey } from "../../../../utils/supabase/info";

const BASE = `${supabaseUrl}/functions/v1/make-server-22ead257`;

export type Route = {
  id: string;
  label: string;
  destination: string;
  nexthop_type: "interface_id" | "gateway_id" | "blackhole" | "platform";
  nexthop: string | null;
  mode: "static" | "bgp" | null;
  status: string;
  is_editable: boolean;
  created_at: string;
  updated_at: string;
};

export type NexthopOption = {
  id: string;
  label: string;
  type: "interface_id" | "gateway_id";
};

async function req(path: string, init?: RequestInit) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${publicAnonKey}`,
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  console.log(`[Supabase ${init?.method ?? "GET"} ${path}] status=${res.status} body=`, text);
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch (e) {
    console.log(`[Supabase ${path}] JSON parse error:`, e);
  }
  if (!res.ok) {
    const msg = json?.error ?? json?.message ?? `Request failed (${res.status}): ${text || "no body"}`;
    console.log(`API error ${path}:`, msg);
    throw new Error(msg);
  }
  return json;
}

export const api = {
  listRoutes: async (): Promise<Route[]> => {
    const r = await req("/routes");
    console.log("[listRoutes] raw response:", r);
    if (!r || !Array.isArray(r.routes)) {
      console.log("[listRoutes] response had no 'routes' array, got:", r);
      return [];
    }
    return r.routes as Route[];
  },
  listNexthops: async (): Promise<NexthopOption[]> => {
    try {
      const r = await req("/nexthop-options");
      console.log("[listNexthops] raw response:", r);
      if (!r || !Array.isArray(r.options)) return [];
      return r.options as NexthopOption[];
    } catch (e) {
      console.log("listNexthops failed, returning empty array:", e);
      return [];
    }
  },
  createRoute: (payload: Partial<Route>) =>
    req("/routes", { method: "POST", body: JSON.stringify(payload) }).then((r) => r.route as Route),
  updateRoute: (id: string, payload: Partial<Route>) =>
    req(`/routes/${id}`, { method: "PUT", body: JSON.stringify(payload) }).then((r) => r.route as Route),
  deleteRoute: (id: string) => req(`/routes/${id}`, { method: "DELETE" }),
  reseed: () => req("/reseed", { method: "POST" }),
};
