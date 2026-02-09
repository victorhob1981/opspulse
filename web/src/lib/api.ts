import { supabase } from "./supabase";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

if (!API_BASE_URL) {
  throw new Error("Missing VITE_API_BASE_URL in .env.local");
}

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error("Not authenticated (no access_token)");
  return token;
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  // tenta ler json (ou texto) pra mensagem útil
  const text = await res.text();
  const payload = text ? safeJson(text) : null;

  if (!res.ok) {
    const msg =
      (payload && (payload.error?.message || payload.message)) ||
      text ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return payload;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
