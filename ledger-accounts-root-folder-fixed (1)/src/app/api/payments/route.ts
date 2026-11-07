import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient(); const body = await req.json();
    const { data, error } = await supabase.rpc("record_payment", { p_bill_id: body.bill_id, p_amount: Number(body.amount), p_method: body.method, p_reference: body.reference || null, p_notes: body.notes || null });
    if (error) throw error; return NextResponse.json({ id: data }, { status: 201 });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to record payment" }, { status: 400 }); }
}
