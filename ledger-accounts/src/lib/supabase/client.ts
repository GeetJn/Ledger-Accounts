import { createBrowserClient } from "@supabase/ssr";
let client: ReturnType<typeof createBrowserClient> | undefined;
export function createClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error("Supabase is not configured. Add the URL and anon key to .env.local.");
  }
  client ??= createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return client;
}
