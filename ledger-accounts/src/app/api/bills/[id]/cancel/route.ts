import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const token = (await cookies()).get("ledger_owner_verification")?.value;
    if (!token) {
      return NextResponse.json({ error: "Verify your password before cancelling an invoice." }, { status: 403 });
    }

    const body = await req.json();
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 5 || reason.length > 500) {
      return NextResponse.json({ error: "Enter a cancellation reason between 5 and 500 characters." }, { status: 400 });
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const { error } = await supabase.rpc("cancel_finalized_bill", {
      p_bill_id: id,
      p_token_hash: tokenHash,
      p_reason: reason,
    });
    if (error) throw error;

    const response = NextResponse.json({ success: true });
    response.cookies.set("ledger_owner_verification", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to cancel invoice";
    const status = /verification|required|expired/i.test(message) ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
