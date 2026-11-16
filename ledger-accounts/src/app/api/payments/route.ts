import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const { data, error } = await supabase.from("payments")
      .select("id,bill_id,amount,method,reference,notes,paid_at,reversed_at,reversal_reason")
      .order("paid_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return NextResponse.json({ data: data || [] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to load payment history" }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const body = await req.json();
    const amount = Number(body.amount);
    if (!body.bill_id || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Select a bill and enter a valid payment amount." }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("record_payment", {
      p_bill_id: body.bill_id,
      p_amount: amount,
      p_method: body.method,
      p_reference: body.reference || null,
      p_notes: body.notes || null,
    });
    if (error) throw error;
    return NextResponse.json({ id: data }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to record payment" }, { status: 400 });
  }
}
