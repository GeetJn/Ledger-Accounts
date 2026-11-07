import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; const supabase = await createClient(); const body = await req.json().catch(() => ({}));
    const { data, error } = await supabase.rpc("finalize_bill", { p_bill_id: id, p_bill_discount: Number(body.bill_discount || 0), p_amount_paid: Number(body.amount_paid || 0) });
    if (error) throw error; return NextResponse.json({ bill_number: data });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to finalize bill" }, { status: 400 }); }
}
