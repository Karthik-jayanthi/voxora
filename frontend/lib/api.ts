import { supabase } from "./supabase";

export async function apiFetch(path: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  return fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, { ...init, headers });
}