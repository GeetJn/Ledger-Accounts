import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { billSchema } from "@/lib/validations";
import { toE164 } from "@/lib/utils";
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; const supabase = await createClient(); const { data: bill, error } = await supabase.from("bills").select("*,bill_items(*)").eq("id", id).single(); if (error) throw error;
    return NextResponse.json({ data: bill });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Bill not found" }, { status: 404 }); }
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; const supabase = await createClient(); const parsed = billSchema.safeParse({ ...await req.json(), id });
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid bill" }, { status: 400 });
    const normalized = { ...parsed.data, customer_phone: parsed.data.customer_phone ? toE164(parsed.data.customer_phone, parsed.data.customer_country) : null, id };
    const { data, error } = await supabase.rpc("save_bill_draft", { p_data: normalized }); if (error) throw error;
    return NextResponse.json({ id: data });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Only drafts can be updated here" }, { status: 400 }); }
}
