import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const { data: source, error } = await supabase.from("bills")
      .select("id,status,customer_id,customer_name,customer_phone_e164,customer_address,bill_title,notes,tax_rate,bill_level_discount,timezone,bill_items(item_id,item_name,quantity,unit,mrp,rate,discount,show_price_discount)")
      .eq("id", id).single();
    if (error || !source) return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    if (source.status !== "finalized") return NextResponse.json({ error: "Only finalized bills can be duplicated." }, { status: 400 });

    const lines = (source.bill_items || []).map((item) => ({
      item_id: item.item_id, name: item.item_name, quantity: item.quantity, unit: item.unit,
      mrp: item.mrp, rate: item.rate, discount: item.discount, show_price_discount: item.show_price_discount,
    }));
    const payload = {
      customer_id: source.customer_id, customer_name: source.customer_name,
      customer_phone: source.customer_phone_e164, customer_address: source.customer_address,
      bill_title: source.bill_title ? `Copy of ${source.bill_title}` : "Copy of invoice",
      bill_date: new Date().toISOString().slice(0, 10), due_date: null, notes: source.notes,
      tax_rate: source.tax_rate, bill_discount: source.bill_level_discount, amount_paid: 0,
      timezone: source.timezone, lines,
    };
    const { data: newId, error: saveError } = await supabase.rpc("save_bill_draft", { p_data: payload });
    if (saveError) throw saveError;
    return NextResponse.json({ id: newId }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to duplicate bill" }, { status: 400 });
  }
}
