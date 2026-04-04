import { type SupabaseClient, type User } from "@supabase/supabase-js";

import { getSupabaseBrowserClient } from "@/lib/supabase-client";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
type ClientAndUser = { client: SupabaseClient; user: User };

function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

async function requireClientAndUser(): Promise<ClientAndUser | { error: string }> {
  const client = getSupabaseBrowserClient();
  if (!client) {
    return { error: "Supabase is not configured in this environment." };
  }

  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error) {
    return { error: error.message };
  }

  if (!user) {
    return { error: "Please sign in first." };
  }

  return { client, user };
}

export async function loadPlayerLibraryFromCloud(): Promise<Result<string[]>> {
  const base = await requireClientAndUser();
  if ("error" in base) {
    return { ok: false, error: base.error };
  }

  const { client, user } = base;

  const { data, error } = await client
    .from("player_library")
    .select("name")
    .eq("user_id", user.id)
    .eq("is_archived", false)
    .order("updated_at", { ascending: false });

  if (error) {
    return { ok: false, error: error.message };
  }

  const names = (data ?? [])
    .map((row) => String(row.name ?? "").trim())
    .filter(Boolean);

  return { ok: true, data: [...new Set(names)] };
}

export async function syncPlayerLibraryToCloud(localNames: string[]): Promise<Result<null>> {
  const base = await requireClientAndUser();
  if ("error" in base) {
    return { ok: false, error: base.error };
  }

  const { client, user } = base;

  const normalized = [...new Set(localNames.map((name) => name.trim()).filter(Boolean))];
  const localKeys = new Set(normalized.map(nameKey));

  const { data: existing, error: existingError } = await client
    .from("player_library")
    .select("id,name_key")
    .eq("user_id", user.id)
    .eq("is_archived", false);

  if (existingError) {
    return { ok: false, error: existingError.message };
  }

  const rows = existing ?? [];

  const toDelete = rows.filter((row) => !localKeys.has(String(row.name_key ?? ""))).map((row) => String(row.id));
  if (toDelete.length > 0) {
    const { error } = await client.from("player_library").delete().in("id", toDelete);
    if (error) {
      return { ok: false, error: error.message };
    }
  }

  const existingKeys = new Set(rows.map((row) => String(row.name_key ?? "")));
  const toInsert = normalized
    .filter((name) => !existingKeys.has(nameKey(name)))
    .map((name) => ({
      user_id: user.id,
      name,
      name_key: nameKey(name),
      is_archived: false,
    }));

  if (toInsert.length > 0) {
    const { error } = await client.from("player_library").insert(toInsert);
    if (error) {
      return { ok: false, error: error.message };
    }
  }

  return { ok: true, data: null };
}
