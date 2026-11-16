import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const n = Number(new URL(req.url).searchParams.get("bill_number")); if (!Number.isSafeInteger(n) || n < 1) throw new Error("Enter a valid bill number");
    const token = (await cookies()).get("ledger_owner_verification")?.value; if (!token) return NextResponse.json({ error: "Verify your identity again to view alteration history." }, { status: 403 });
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const { data, error } = await supabase.rpc("owner_bill_history", { p_bill_number: n, p_token_hash: tokenHash }); if (error) throw error;
    if (!data?.length) return NextResponse.json({ data: null, message: "No bill found with this bill number." });
    return NextResponse.json({ data });
  } catch (e) { const message=e instanceof Error?e.message:"Unable to retrieve history"; return NextResponse.json({ error: message }, { status: /verification|required|expired/i.test(message)?403:400 }); }
}
