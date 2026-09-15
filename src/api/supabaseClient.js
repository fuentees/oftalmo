import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env.local."
  );
}

const fallbackUrl = "http://localhost:54321";
const fallbackKey = "public-anon-key";

const isTransientNetworkError = (error) => {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("network error") ||
    message.includes("networkerror") ||
    message.includes("load failed") ||
    message.includes("err_failed") ||
    error?.name === "TypeError"
  );
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Consultas GET são idempotentes: em falhas transitórias de rede/CORS na
// borda do Supabase (que não indicam RLS/erro de aplicação, só uma resposta
// que nunca chegou), tentamos novamente antes de propagar o erro.
const retryableFetch = async (input, init) => {
  const method = String(init?.method || "GET").toUpperCase();
  const maxAttempts = method === "GET" ? 3 : 1;
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetch(input, init);
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isTransientNetworkError(error)) {
        throw error;
      }
      await wait(300 * attempt);
    }
  }
  throw lastError;
};

export const supabase = createClient(
  supabaseUrl || fallbackUrl,
  supabaseAnonKey || fallbackKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    global: {
      fetch: retryableFetch,
    },
  }
);
