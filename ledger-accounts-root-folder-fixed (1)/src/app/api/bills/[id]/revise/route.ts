import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { billSchema } from "@/lib/validations";
import { toE164 } from "@/lib/utils";
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const token = (await cookies()).get("ledger_owner_verification")?.value; if (!token) return NextResponse.json({ error: "Verify your password before saving an alteration." }, { status: 403 });
    const body = await req.json(); const parsed = billSchema.safeParse(body); if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid bill data" }, { status: 400 });
    const normalized = { ...parsed.data, customer_phone: parsed.data.customer_phone ? toE164(parsed.data.customer_phone, parsed.data.customer_country) : null };
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const { data, error } = await supabase.rpc("revise_finalized_bill", { p_bill_id: id, p_data: normalized, p_token_hash: tokenHash, p_reason: body.reason || null }); if (error) throw error;
    return NextResponse.json({ revision_number: data });
  } catch (e) { const message=e instanceof Error?e.message:"Unable to save bill revision"; return NextResponse.json({ error: message }, { status: /verification|required|expired/i.test(message)?403:400 }); }
}
