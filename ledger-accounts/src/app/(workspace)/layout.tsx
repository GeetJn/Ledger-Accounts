import AppShell from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
export default async function WorkspaceLayout({children}:{children:React.ReactNode}) {
  let ownerName="Business Owner", shopName="My Shop";
  try {
    const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser();
    if(user){ const {data:profile}=await supabase.from("profiles").select("full_name,shop_id").eq("id",user.id).single(); ownerName=profile?.full_name||user.email?.split("@")[0]||ownerName;
      if(profile?.shop_id){const {data:shop}=await supabase.from("shops").select("name").eq("id",profile.shop_id).single();shopName=shop?.name||shopName;}}
  } catch {}
  return <AppShell ownerName={ownerName} shopName={shopName}>{children}</AppShell>;
}
