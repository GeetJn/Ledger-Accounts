import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toE164 } from "@/lib/utils";

const allowed = ["items", "customers", "expenses"] as const;
type Kind = typeof allowed[number];
function table(kind: string): Kind | null { return allowed.includes(kind as Kind) ? kind as Kind : null; }
export async function GET(_req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  try {
    const { kind } = await params; const t = table(kind); if (!t) return NextResponse.json({ error: "Unknown record type" }, { status: 404 });
    const supabase = await createClient(); const { data, error } = await supabase.from(t).select("*").is("archived_at", null).order(t === "expenses" ? "expense_date" : "created_at", { ascending: false }).limit(500);
    if (error) throw error; return NextResponse.json({ data });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to load records" }, { status: 400 }); }
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  try {
    const { kind } = await params; const t = table(kind); if (!t) return NextResponse.json({ error: "Unknown record type" }, { status: 404 });
    const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const { data: profile } = await supabase.from("profiles").select("shop_id").eq("id", user.id).single(); if (!profile?.shop_id) throw new Error("Shop profile is missing");
    const body = await req.json(); let payload: Record<string, unknown>;
    if (t === "items") payload = { name: String(body.name ?? "").trim(), mrp: Number(body.mrp), unit: body.unit || "pcs", description: body.description || null, sku: body.sku || null, tax_rate: body.tax_rate === "" ? null : body.tax_rate === undefined ? null : Number(body.tax_rate), stock_quantity: body.stock_quantity === "" || body.stock_quantity === undefined ? null : Number(body.stock_quantity), shop_id: profile.shop_id };
    else if (t === "customers") payload = { name: String(body.name ?? "").trim(), phone_e164: body.phone ? toE164(String(body.phone), body.country_code || "IN") : null, email: body.email || null, address: body.address || null, notes: body.notes || null, shop_id: profile.shop_id };
    else payload = { title: String(body.title ?? "").trim(), amount: Number(body.amount), expense_date: body.expense_date || new Date().toISOString().slice(0,10), category: body.category || "Other", method: body.method || "cash", description: body.description || null, shop_id: profile.shop_id, created_by: user.id };
    if (!String(payload.name ?? payload.title ?? "").trim()) throw new Error("A name or title is required");
    const amount = Number(payload.mrp ?? payload.amount ?? 0); if (!Number.isFinite(amount) || amount < 0) throw new Error("Enter a valid non-negative amount");
    const { data, error } = await supabase.from(t).insert(payload).select("*").single(); if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to save record" }, { status: 400 }); }
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  try {
    const { kind } = await params; const t = table(kind); if (!t) return NextResponse.json({ error: "Unknown record type" }, { status: 404 });
    const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const body = await req.json(); const { id, ...raw } = body; if (!id) throw new Error("Record ID is required");
    const fields = t === "items" ? ["name","mrp","unit","description","sku","tax_rate","stock_quantity"] : t === "customers" ? ["name","phone_e164","email","address","notes"] : ["title","amount","expense_date","category","method","description"];
    const patch: Record<string, unknown> = {}; for (const f of fields) if (Object.hasOwn(raw, f)) patch[f] = raw[f];
    if (t === "items") { if (Object.hasOwn(raw,"mrp")) patch.mrp=Number(raw.mrp); if (raw.tax_rate === "") patch.tax_rate=null; else if (raw.tax_rate !== undefined) patch.tax_rate=Number(raw.tax_rate); if (raw.stock_quantity === "") patch.stock_quantity=null; else if (raw.stock_quantity !== undefined) patch.stock_quantity=Number(raw.stock_quantity); }
    if (t === "expenses" && raw.amount !== undefined) patch.amount=Number(raw.amount);
    if (t === "customers" && Object.hasOwn(raw,"phone")) patch.phone_e164 = raw.phone ? toE164(String(raw.phone), raw.country_code || "IN") : null;
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from(t).update(patch).eq("id", id).select("*").single(); if (error) throw error;
    return NextResponse.json({ data });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to update record" }, { status: 400 }); }
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  try {
    const { kind } = await params; const t = table(kind); if (!t) return NextResponse.json({ error: "Unknown record type" }, { status: 404 });
    const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const id = new URL(req.url).searchParams.get("id"); if (!id) throw new Error("Record ID is required");
    const { error } = await supabase.from(t).update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id); if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to archive record" }, { status: 400 }); }
}
