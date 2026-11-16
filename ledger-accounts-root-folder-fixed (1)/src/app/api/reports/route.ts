import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ReportLine = { item_name: string; quantity: number; line_total: number };
type ReportBill = {
  id: string;
  bill_number: number | null;
  bill_date: string;
  customer_name: string | null;
  final_amount: number;
  amount_paid: number;
  bill_items?: ReportLine[] | null;
};

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

function monthLabel(key: string): string {
  const parts = key.split("-").map(Number);
  return new Date(parts[0], parts[1] - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

function buildAnalytics(rows: ReportBill[], total: number, from: string | null, to: string | null) {
  const customers = new Map<string, { name: string; invoice_count: number; billed: number }>();
  const items = new Map<string, { name: string; quantity: number; sales: number }>();
  const now = new Date();
  const endMonth = (to || now.toISOString().slice(0, 10)).slice(0, 7);
  const defaultStart = new Date(Number(endMonth.slice(0, 4)), Number(endMonth.slice(5, 7)) - 6, 1);
  const startMonth = (from || defaultStart.toISOString().slice(0, 7)).slice(0, 7);
  let cursor = new Date(Number(startMonth.slice(0, 4)), Number(startMonth.slice(5, 7)) - 1, 1);
  const finish = new Date(Number(endMonth.slice(0, 4)), Number(endMonth.slice(5, 7)) - 1, 1);
  const monthly: Array<{ key: string; label: string; sales: number }> = [];
  const monthIndex = new Map<string, number>();
  while (cursor <= finish && monthly.length < 60) {
    const key = cursor.getFullYear() + "-" + String(cursor.getMonth() + 1).padStart(2, "0");
    monthIndex.set(key, monthly.length);
    monthly.push({ key, label: monthLabel(key), sales: 0 });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  for (const bill of rows) {
    const billed = Number(bill.final_amount || 0);
    const customerName = (bill.customer_name || "Walk-in customer").trim() || "Walk-in customer";
    const existingCustomer = customers.get(customerName) || { name: customerName, invoice_count: 0, billed: 0 };
    existingCustomer.invoice_count += 1;
    existingCustomer.billed += billed;
    customers.set(customerName, existingCustomer);

    const month = monthIndex.get(String(bill.bill_date).slice(0, 7));
    if (month !== undefined) monthly[month].sales += billed;

    for (const line of bill.bill_items || []) {
      const itemName = (line.item_name || "Unnamed item").trim() || "Unnamed item";
      const existingItem = items.get(itemName) || { name: itemName, quantity: 0, sales: 0 };
      existingItem.quantity += Number(line.quantity || 0);
      existingItem.sales += Number(line.line_total || 0);
      items.set(itemName, existingItem);
    }
  }

  return {
    monthly_sales: monthly,
    top_customers: Array.from(customers.values()).sort((a, b) => b.billed - a.billed).slice(0, 8),
    top_items: Array.from(items.values()).sort((a, b) => b.sales - a.sales).slice(0, 8),
    analytics_truncated: total > rows.length,
    monthly_range_truncated: cursor <= finish,
  };
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
    const analytics = buildAnalytics(rows, total, from, to);
    return NextResponse.json({
      ...(summary || {}),
      bills: rows.slice(0, 500).map(({ bill_items: _items, ...bill }) => bill),
      bills_total: total,
      bills_truncated: total > 500,
      ...analytics,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to prepare report" }, { status: 400 });
  }
}
