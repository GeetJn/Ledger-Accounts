import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { billSchema } from "@/lib/validations";
import { toE164 } from "@/lib/utils";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const { data, error } = await supabase
      .from("bills")
      .select("*,bill_items(*)")
      .eq("id", id)
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    }
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to load bill",
    }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const parsed = billSchema.safeParse({ ...await req.json(), id });
    if (!parsed.success) {
      return NextResponse.json({
        error: parsed.error.issues[0]?.message || "Invalid bill",
      }, { status: 400 });
    }

    const normalized = {
      ...parsed.data,
      customer_phone: parsed.data.customer_phone
        ? toE164(parsed.data.customer_phone, parsed.data.customer_country)
        : null,
      id,
    };
    const { data, error } = await supabase.rpc("save_bill_draft", { p_data: normalized });
    if (error) throw error;
    return NextResponse.json({ id: data });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Only drafts can be updated here",
    }, { status: 400 });
  }
}
