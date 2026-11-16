import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const { id } = await params;
    const body = await req.json();
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 5) {
      return NextResponse.json({ error: "Enter a reversal reason of at least five characters." }, { status: 400 });
    }
    const { error } = await supabase.rpc("reverse_payment", {
      p_payment_id: id,
      p_reason: reason,
    });
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to reverse payment" }, { status: 400 });
  }
}
