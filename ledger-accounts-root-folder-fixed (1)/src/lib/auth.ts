import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
export async function getUserOrNull() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
export async function requireUser() {
  const user = await getUserOrNull();
  if (!user) redirect("/login");
  return user;
}
