import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toE164 } from "@/lib/utils";

const allowed = ["items", "customers", "expenses"] as const;
type Kind = typeof allowed[number];
function table(kind: string): Kind | null {
  return allowed.includes(kind as Kind) ? kind as Kind : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  try {
    const { kind } = await params;
    const t = table(kind);
    if (!t) return NextResponse.json({ error: "Unknown record type" }, { status: 404 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const { data, error } = await supabase.from(t).select("*")
      .is("archived_at", null)
      .order(t === "expenses" ? "expense_date" : "created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to load records" }, { status: 400 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  try {
    const { kind } = await params;
    const t = table(kind);
    if (!t) return NextResponse.json({ error: "Unknown record type" }, { status: 404 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const { data: profile } = await supabase.from("profiles").select("shop_id").eq("id", user.id).single();
    if (!profile?.shop_id) throw new Error("Shop profile is missing");

    const body = await req.json();
    let payload: Record<string, unknown>;
    let openingStock: number | null = null;
    if (t === "items") {
      if (body.stock_quantity !== "" && body.stock_quantity !== undefined && body.stock_quantity !== null) {
        openingStock = Number(body.stock_quantity);
        if (!Number.isFinite(openingStock) || openingStock < 0) throw new Error("Stock quantity must be zero or greater");
        if (String(body.stock_reason || "").trim().length < 3) throw new Error("Enter a reason of at least three characters for the opening stock.");
      }
      // Stock is deliberately excluded: the database migration requires all stock
      // changes to pass through set_item_stock so they are recorded in the movement ledger.
      payload = {
        name: String(body.name ?? "").trim(),
        mrp: Number(body.mrp),
        unit: body.unit || "pcs",
        category: String(body.category || "General").trim(),
        cost_price: body.cost_price === "" || body.cost_price === undefined ? 0 : Number(body.cost_price),
        low_stock_threshold: body.low_stock_threshold === "" || body.low_stock_threshold === undefined ? 5 : Number(body.low_stock_threshold),
        description: body.description || null,
        sku: body.sku || null,
        tax_rate: body.tax_rate === "" || body.tax_rate === undefined ? null : Number(body.tax_rate),
        shop_id: profile.shop_id,
      };
    } else if (t === "customers") {
      payload = {
        name: String(body.name ?? "").trim(),
        phone_e164: body.phone ? toE164(String(body.phone), body.country_code || "IN") : null,
        email: body.email || null,
        address: body.address || null,
        notes: body.notes || null,
        shop_id: profile.shop_id,
      };
    } else {
      payload = {
        title: String(body.title ?? "").trim(),
        amount: Number(body.amount),
        expense_date: body.expense_date || new Date().toISOString().slice(0, 10),
        category: body.category || "Other",
        method: body.method || "cash",
        description: body.description || null,
        shop_id: profile.shop_id,
        created_by: user.id,
      };
    }

    if (!String(payload.name ?? payload.title ?? "").trim()) throw new Error("A name or title is required");
    const amount = Number(payload.mrp ?? payload.amount ?? 0);
    if (!Number.isFinite(amount) || amount < 0) throw new Error("Enter a valid non-negative amount");
    if (t === "items" && (!Number.isFinite(Number(payload.cost_price)) || Number(payload.cost_price) < 0 ||
      !Number.isFinite(Number(payload.low_stock_threshold)) || Number(payload.low_stock_threshold) < 0)) {
      throw new Error("Cost price and low-stock threshold must be valid non-negative numbers.");
    }

    const { data, error } = await supabase.from(t).insert(payload).select("*").single();
    if (error) throw error;

    if (t === "items" && openingStock !== null) {
      const { error: stockError } = await supabase.rpc("set_item_stock", {
        p_item_id: data.id,
        p_quantity: openingStock,
        p_reason: String(body.stock_reason).trim(),
      });
      if (stockError) {
        await supabase.from("items").update({ archived_at: new Date().toISOString() }).eq("id", data.id);
        throw stockError;
      }
    }
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to save record" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  try {
    const { kind } = await params;
    const t = table(kind);
    if (!t) return NextResponse.json({ error: "Unknown record type" }, { status: 404 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const body = await req.json();
    const { id, ...raw } = body;
    if (!id) throw new Error("Record ID is required");
    const fields = t === "items"
      ? ["name", "mrp", "unit", "category", "cost_price", "low_stock_threshold", "description", "sku", "tax_rate"]
      : t === "customers"
        ? ["name", "phone_e164", "email", "address", "notes"]
        : ["title", "amount", "expense_date", "category", "method", "description"];
    const patch: Record<string, unknown> = {};
    for (const f of fields) if (Object.hasOwn(raw, f)) patch[f] = raw[f];

    if (t === "items") {
      if (Object.hasOwn(raw, "mrp")) patch.mrp = Number(raw.mrp);
      if (Object.hasOwn(raw, "cost_price")) patch.cost_price = Number(raw.cost_price);
      if (Object.hasOwn(raw, "low_stock_threshold")) patch.low_stock_threshold = Number(raw.low_stock_threshold);
      if ((patch.cost_price !== undefined && (!Number.isFinite(Number(patch.cost_price)) || Number(patch.cost_price) < 0)) ||
        (patch.low_stock_threshold !== undefined && (!Number.isFinite(Number(patch.low_stock_threshold)) || Number(patch.low_stock_threshold) < 0))) {
        throw new Error("Cost price and low-stock threshold must be valid non-negative numbers.");
      }
      if (raw.tax_rate === "") patch.tax_rate = null;
      else if (raw.tax_rate !== undefined) patch.tax_rate = Number(raw.tax_rate);
    }
    if (t === "expenses" && raw.amount !== undefined) patch.amount = Number(raw.amount);
    if (t === "customers" && Object.hasOwn(raw, "phone")) {
      patch.phone_e164 = raw.phone ? toE164(String(raw.phone), raw.country_code || "IN") : null;
    }

    const changesStock = t === "items" && raw.stock_quantity !== "" &&
      raw.stock_quantity !== undefined && raw.stock_quantity !== null;
    if (changesStock) {
      const quantity = Number(raw.stock_quantity);
      if (!Number.isFinite(quantity) || quantity < 0) throw new Error("Stock quantity must be zero or greater");
      if (String(raw.stock_reason || "").trim().length < 3) {
        throw new Error("Enter a reason of at least three characters for the stock adjustment.");
      }
    }

    if (Object.keys(patch).length) {
      patch.updated_at = new Date().toISOString();
      const { error } = await supabase.from(t).update(patch).eq("id", id);
      if (error) throw error;
    }

    if (changesStock) {
      const { error } = await supabase.rpc("set_item_stock", {
        p_item_id: id,
        p_quantity: Number(raw.stock_quantity),
        p_reason: String(raw.stock_reason).trim(),
      });
      if (error) throw error;
    }

    const { data, error } = await supabase.from(t).select("*").eq("id", id).single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to update record" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  try {
    const { kind } = await params;
    const t = table(kind);
    if (!t) return NextResponse.json({ error: "Unknown record type" }, { status: 404 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new Error("Record ID is required");
    const { error } = await supabase.from(t).update({
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to archive record" }, { status: 400 });
  }
}
