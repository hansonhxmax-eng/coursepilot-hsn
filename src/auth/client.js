import { createClient } from "@supabase/supabase-js";

export function publicAuthConfig(env = {}) {
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) return null;
  try {
    const endpoint = new URL(url);
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) return null;
    let publicKey = key.startsWith("sb_publishable_");
    if (!publicKey && key.split(".").length === 3) {
      const payload = key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      publicKey = JSON.parse(atob(payload)).role === "anon";
    }
    return publicKey ? { url: endpoint.origin, key } : null;
  } catch {
    return null;
  }
}

const config = publicAuthConfig(import.meta.env);
export const authClient = config ? createClient(config.url, config.key, {
  auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null;

export function authRedirect(kind) {
  const url = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set("auth", kind);
  return url.href;
}
