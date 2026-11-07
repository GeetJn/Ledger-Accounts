import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient(); const from = new URL(req.url).searchParams.get("from"); const to = new URL(req.url).searchParams.get("to");
    const { data: summary, error: summaryError } = await supabase.rpc("business_summary", { p_from: from || null, p_to: to || null });
    if (summaryError) throw summaryError;
    let bq = supabase.from("bills").select("id,bill_number,bill_date,final_amount,amount_paid,discount_amount,status,customer_name").eq("status", "finalized").order("bill_date", { ascending: false }).limit(200);
    if (from) bq = bq.gte("bill_date", from);
    if (to) bq = bq.lte("bill_date", to);
    const { data: bills, error } = await bq; if (error) throw error;
    return NextResponse.json({ ...(summary || {}), bills: bills || [] });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to prepare report" }, { status: 400 }); }
}
