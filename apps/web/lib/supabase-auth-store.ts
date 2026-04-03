"use client";

import { useSyncExternalStore } from "react";

import { getSupabaseBrowserClient, getSupabaseConfig } from "@/lib/supabase-client";

type Listener = () => void;

type AuthSnapshot = {
  configured: boolean;
  loading: boolean;
  userId: string | null;
  email: string | null;
  lastError: string | null;
};

const listeners = new Set<Listener>();
let initialized = false;
let snapshot: AuthSnapshot = {
  configured: getSupabaseConfig().configured,
  loading: false,
  userId: null,
  email: null,
  lastError: null,
};

function emitChange() {
  listeners.forEach((listener) => listener());
}

function setSnapshot(patch: Partial<AuthSnapshot>) {
  snapshot = {
    ...snapshot,
    ...patch,
  };
  emitChange();
}

async function refreshAuthState() {
  const client = getSupabaseBrowserClient();
  if (!client) {
    setSnapshot({
      configured: false,
      loading: false,
      userId: null,
      email: null,
      lastError: null,
    });
    return;
  }

  setSnapshot({ configured: true, loading: true, lastError: null });

  const { data, error } = await client.auth.getUser();
  if (error) {
    setSnapshot({
      loading: false,
      userId: null,
      email: null,
      lastError: error.message,
    });
    return;
  }

  setSnapshot({
    loading: false,
    userId: data.user?.id ?? null,
    email: data.user?.email ?? null,
    lastError: null,
  });
}

function ensureInitialized() {
  if (initialized) return;
  initialized = true;

  const client = getSupabaseBrowserClient();
  if (!client) {
    setSnapshot({ configured: false });
    return;
  }

  client.auth.onAuthStateChange(() => {
    void refreshAuthState();
  });

  void refreshAuthState();
}

function subscribe(listener: Listener): () => void {
  ensureInitialized();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): AuthSnapshot {
  return snapshot;
}

function getServerSnapshot(): AuthSnapshot {
  return {
    configured: false,
    loading: false,
    userId: null,
    email: null,
    lastError: null,
  };
}

async function sendMagicLink(email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = getSupabaseBrowserClient();
  if (!client) {
    return { ok: false, error: "Supabase is not configured in this environment." };
  }

  const normalizedEmail = email.trim();
  if (!normalizedEmail.includes("@")) {
    return { ok: false, error: "Please enter a valid email." };
  }

  const { error } = await client.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      emailRedirectTo: window.location.href.split("#")[0],
    },
  });

  if (error) {
    setSnapshot({ lastError: error.message });
    return { ok: false, error: error.message };
  }

  setSnapshot({ lastError: null });
  return { ok: true };
}

async function signOut(): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = getSupabaseBrowserClient();
  if (!client) {
    return { ok: false, error: "Supabase is not configured in this environment." };
  }

  const { error } = await client.auth.signOut();
  if (error) {
    setSnapshot({ lastError: error.message });
    return { ok: false, error: error.message };
  }

  setSnapshot({ userId: null, email: null, lastError: null });
  return { ok: true };
}

export function useSupabaseAuthStore() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    state,
    actions: {
      refreshAuthState,
      sendMagicLink,
      signOut,
    },
  };
}
