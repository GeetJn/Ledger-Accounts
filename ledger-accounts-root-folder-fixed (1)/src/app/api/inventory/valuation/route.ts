import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("id", user.id)
      .single();
    if (profileError || !profile?.shop_id) {
      return NextResponse.json({ error: "Shop profile is missing" }, { status: 400 });
    }

    const [{ data: summary, error: summaryError }, { data: shop, error: shopError }] = await Promise.all([
      supabase.rpc("inventory_summary"),
      supabase.from("shops").select("currency,locale").eq("id", profile.shop_id).single(),
    ]);
    if (summaryError) throw summaryError;
    if (shopError) throw shopError;

    return NextResponse.json({
      ...(summary || {}),
      currency: shop.currency || "INR",
      locale: shop.locale || "en-IN",
      valuation_basis: "Current tracked quantity multiplied by current purchase cost. Untracked products are excluded.",
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to calculate inventory valuation",
    }, { status: 400 });
  }
}
