import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const { data: movements, error } = await supabase.from("stock_movements")
      .select("id,item_id,bill_id,quantity_delta,movement_type,reason,created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;

    const itemIds = Array.from(new Set((movements || []).map(row => row.item_id)));
    const { data: items, error: itemsError } = itemIds.length
      ? await supabase.from("items").select("id,name").in("id", itemIds)
      : { data: [], error: null };
    if (itemsError) throw itemsError;

    const names = new Map((items || []).map(item => [item.id, item.name]));
    return NextResponse.json({
      data: (movements || []).map(row => ({ ...row, item_name: names.get(row.item_id) || "Archived item" })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to load stock movement history" }, { status: 400 });
  }
}
