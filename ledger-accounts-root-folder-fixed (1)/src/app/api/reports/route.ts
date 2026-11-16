import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function validDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const params = new URL(req.url).searchParams;
    const from = params.get("from");
    const to = params.get("to");
    if (from && !validDate(from)) {
      return NextResponse.json({ error: "Enter a valid start date (YYYY-MM-DD)." }, { status: 400 });
    }
    if (to && !validDate(to)) {
      return NextResponse.json({ error: "Enter a valid end date (YYYY-MM-DD)." }, { status: 400 });
    }
    if (from && to && from > to) {
      return NextResponse.json({ error: "The start date must be on or before the end date." }, { status: 400 });
    }

    const { data: summary, error: summaryError } = await supabase.rpc("business_summary", {
      p_from: from || null,
      p_to: to || null,
    });
    if (summaryError) throw summaryError;

    let billsQuery = supabase.from("bills")
      .select("id,bill_number,bill_date,final_amount,amount_paid,discount_amount,status,customer_name")
      .eq("status", "finalized")
      .order("bill_date", { ascending: false })
      .limit(200);
    if (from) billsQuery = billsQuery.gte("bill_date", from);
    if (to) billsQuery = billsQuery.lte("bill_date", to);

    const { data: bills, error } = await billsQuery;
    if (error) throw error;
    return NextResponse.json({ ...(summary || {}), bills: bills || [] });
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : "Unable to prepare report",
    }, { status: 400 });
  }
}
