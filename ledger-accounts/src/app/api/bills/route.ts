import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { billSchema } from "@/lib/validations";
import { toE164 } from "@/lib/utils";
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const params = new URL(req.url).searchParams; const rawQ = params.get("q")?.trim() || ""; const q = rawQ.replace(/[(),%\\]/g," ").replace(/\s+/g," ").trim().slice(0,80); const requestedStatus = params.get("status"); const status = ["draft","finalized","cancelled","archived"].includes(requestedStatus||"") ? requestedStatus : null; const requestedPage=Number(params.get("page")||1); const page=Number.isSafeInteger(requestedPage)&&requestedPage>0?Math.min(requestedPage,1_000_000):1; const pageSize=50;
    let query = supabase.from("bills").select("id,bill_number,bill_title,customer_name,customer_phone_e164,status,bill_date,created_at,updated_at,final_amount,amount_paid",{count:"exact"}).order("bill_number", { ascending: false, nullsFirst:false }).order("created_at",{ascending:false});
    if (status && status !== "all") query = query.eq("status", status);
    if (q) query = query.or(`customer_name.ilike.%${q}%,bill_title.ilike.%${q}%,customer_phone_e164.ilike.%${q}%${/^\d+$/.test(q) ? `,bill_number.eq.${q}` : ""}`);
    const { data, error, count } = await query.range((page-1)*pageSize,page*pageSize-1); if (error) throw error; return NextResponse.json({ data, page, page_size:pageSize, total:count||0 });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to load bills" }, { status: 400 }); }
}
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const parsed = billSchema.safeParse(await req.json()); if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid bill data" }, { status: 400 });
    const normalized = { ...parsed.data, customer_phone: parsed.data.customer_phone ? toE164(parsed.data.customer_phone, parsed.data.customer_country) : null };
    const { data, error } = await supabase.rpc("save_bill_draft", { p_data: normalized }); if (error) throw error;
    return NextResponse.json({ id: data }, { status: 201 });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to save draft" }, { status: 400 }); }
}
