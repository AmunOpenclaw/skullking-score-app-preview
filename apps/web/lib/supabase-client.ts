import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null | undefined;

function readEnv(key: string): string {
  const value = process.env[key]?.trim();
  return value ?? "";
}

export function getSupabaseConfig() {
  const url = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey = readEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

  return {
    url,
    publishableKey,
    configured: Boolean(url && publishableKey),
  };
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (cachedClient !== undefined) {
    return cachedClient;
  }

  const config = getSupabaseConfig();
  if (!config.configured) {
    cachedClient = null;
    return cachedClient;
  }

  cachedClient = createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return cachedClient;
}
