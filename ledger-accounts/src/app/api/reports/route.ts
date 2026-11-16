import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

import { buildReportAnalytics, type ReportBill } from "@/lib/report-analytics";

function validDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function csvCell(value: unknown): string {
  const raw = String(value ?? "");
  const safe = typeof value === "number" ? raw : (/^[\s]*[=+@-]/.test(raw) ? "'" + raw : raw);
  return '"' + safe.replaceAll('"', '""') + '"';
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const params = new URL(req.url).searchParams;
    const from = params.get("from");
    const to = params.get("to");
    if (from && !validDate(from)) return NextResponse.json({ error: "Enter a valid start date (YYYY-MM-DD)." }, { status: 400 });
    if (to && !validDate(to)) return NextResponse.json({ error: "Enter a valid end date (YYYY-MM-DD)." }, { status: 400 });
    if (from && to && from > to) return NextResponse.json({ error: "The start date must be on or before the end date." }, { status: 400 });

    if (params.get("export") === "csv") {
      let countQuery = supabase.from("bills").select("id", { count: "exact", head: true }).eq("status", "finalized");
      if (from) countQuery = countQuery.gte("bill_date", from);
      if (to) countQuery = countQuery.lte("bill_date", to);
      const { count, error: countError } = await countQuery;
      if (countError) throw countError;
      const total = count || 0;
      if (total > 10000) return NextResponse.json({ error: "This export contains more than 10,000 invoices. Apply a narrower date range and export in sections." }, { status: 413 });

      const rows: Array<Record<string, unknown>> = [];
      for (let start = 0; start < total; start += 1000) {
        let query = supabase.from("bills")
          .select("bill_number,bill_date,customer_name,status,final_amount,amount_paid,discount_amount")
          .eq("status", "finalized")
          .order("bill_date", { ascending: false })
          .order("bill_number", { ascending: false })
          .range(start, Math.min(start + 999, total - 1));
        if (from) query = query.gte("bill_date", from);
        if (to) query = query.lte("bill_date", to);
        const { data, error } = await query;
        if (error) throw error;
        rows.push(...((data || []) as unknown as Array<Record<string, unknown>>));
      }
      const csvRows = [
        ["Bill number", "Bill date", "Customer", "Status", "Final amount", "Amount paid", "Discount"],
        ...rows.map((bill) => [bill.bill_number, bill.bill_date, bill.customer_name, bill.status, bill.final_amount, bill.amount_paid, bill.discount_amount]),
      ];
      const csv = csvRows.map((row) => row.map(csvCell).join(",")).join("\r\n");
      return new NextResponse("\uFEFF" + csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="ledger-accounts-bills.csv"',
          "Cache-Control": "private, no-store",
        },
      });
    }

    const { data: profile, error: profileError } = await supabase.from("profiles").select("shop_id").eq("id", user.id).single();
    if (profileError || !profile?.shop_id) return NextResponse.json({ error: "Business profile not found" }, { status: 404 });
    const { data: shop } = await supabase.from("shops").select("currency,locale").eq("id", profile.shop_id).single();

    const [{ data: summary, error: summaryError }, { data: rawBills, error, count }] = await Promise.all([
      supabase.rpc("business_summary", { p_from: from || null, p_to: to || null }),
      (() => {
        let query = supabase.from("bills")
          .select("id,bill_number,bill_date,final_amount,amount_paid,customer_name,bill_items(item_name,quantity,line_total)", { count: "exact" })
          .eq("status", "finalized")
          .order("bill_date", { ascending: false })
          .order("bill_number", { ascending: false })
          .range(0, 9999);
        if (from) query = query.gte("bill_date", from);
        if (to) query = query.lte("bill_date", to);
        return query;
      })(),
    ]);
    if (summaryError) throw summaryError;
    if (error) throw error;

    const rows = (rawBills || []) as unknown as ReportBill[];
    const total = count || 0;
    const analytics = buildReportAnalytics(rows, total, from, to);
    return NextResponse.json({
      ...(summary || {}),
      currency: shop?.currency || "INR",
      locale: shop?.locale || "en-IN",
      bills: rows.slice(0, 500).map(({ bill_items: _items, ...bill }) => bill),
      bills_total: total,
      bills_truncated: total > 500,
      ...analytics,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to prepare report" }, { status: 400 });
  }
}
