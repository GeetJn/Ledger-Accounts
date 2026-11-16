import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 25;
const SUMMARY_LIMIT = 10000;
const EXPORT_LIMIT = 20000;

function safePage(value: string | null) {
  const n = Number(value || 1);
  return Number.isSafeInteger(n) && n > 0 ? Math.min(n, 1000000) : 1;
}
function csvCell(value: unknown) {
  const raw = String(value ?? "");
  const safe = /^[\s]*[=+@-]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}
async function fetchAllRows<T>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: "bills" | "payments",
  customerId: string,
  columns: string,
  total: number,
): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; start < total; start += 1000) {
    let query = supabase.from(table).select(columns).eq("customer_id", customerId)
      .order(table === "bills" ? "bill_date" : "paid_at", { ascending: false })
      .range(start, Math.min(start + 999, total - 1));
    if (table === "bills") query = query.eq("status", "finalized") as typeof query;
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...((data || []) as unknown as T[]));
  }
  return rows;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const search = new URL(req.url).searchParams;
    const { data: profile } = await supabase.from("profiles").select("shop_id").eq("id", user.id).single();
    if (!profile?.shop_id) return NextResponse.json({ error: "Business profile not found" }, { status: 404 });
    const { data: shop } = await supabase.from("shops").select("currency,locale").eq("id", profile.shop_id).single();
    const { data: customer, error: customerError } = await supabase.from("customers")
      .select("id,name,phone_e164,email,address").eq("id", id).is("archived_at", null).single();
    if (customerError || !customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

    if (search.get("export") === "csv") {
      const [{ count: billCount, error: billCountError }, { count: paymentCount, error: paymentCountError }] = await Promise.all([
        supabase.from("bills").select("id", { count: "exact", head: true }).eq("customer_id", id).eq("status", "finalized"),
        supabase.from("payments").select("id", { count: "exact", head: true }).eq("customer_id", id),
      ]);
      if (billCountError) throw billCountError;
      if (paymentCountError) throw paymentCountError;
      const billTotal = billCount || 0, paymentTotal = paymentCount || 0;
      if (billTotal > EXPORT_LIMIT || paymentTotal > EXPORT_LIMIT) {
        return NextResponse.json({ error: "This customer statement exceeds the 20,000-invoice or 20,000-payment export limit. Use a database backup or export smaller periods." }, { status: 413 });
      }
      const [bills, payments] = await Promise.all([
        fetchAllRows<Record<string, unknown>>(supabase, "bills", id, "id,bill_number,bill_date,final_amount,amount_paid,status", billTotal),
        fetchAllRows<Record<string, unknown>>(supabase, "payments", id, "id,bill_id,amount,method,paid_at,reversed_at,reversal_reason", paymentTotal),
      ]);
      const rows: unknown[][] = [
        ["Type", "Date", "Reference", "Amount", "Paid", "Balance", "Status / method", "Reversal reason"],
        ...bills.map((bill) => ["Invoice", bill.bill_date, bill.bill_number ?? bill.id, bill.final_amount, bill.amount_paid,
          Math.max(0, Number(bill.final_amount) - Number(bill.amount_paid)), bill.status, ""]),
        ...payments.map((payment) => ["Payment", payment.paid_at, payment.bill_id, payment.amount,
          payment.reversed_at ? 0 : payment.amount, "", payment.reversed_at ? "Reversed" : payment.method, payment.reversal_reason || ""]),
      ];
      const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="customer-ledger-${customer.id}.csv"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    const billPage = safePage(search.get("bill_page"));
    const paymentPage = safePage(search.get("payment_page"));
    const [{ data: bills, error: billsError, count: billCount }, { data: payments, error: paymentsError, count: paymentCount }] = await Promise.all([
      supabase.from("bills").select("id,bill_number,bill_date,due_date,status,final_amount,amount_paid,discount_amount", { count: "exact" })
        .eq("customer_id", id).eq("status", "finalized").order("bill_date", { ascending: false })
        .range((billPage - 1) * PAGE_SIZE, billPage * PAGE_SIZE - 1),
      supabase.from("payments").select("id,bill_id,amount,method,reference,notes,paid_at,reversed_at,reversal_reason", { count: "exact" })
        .eq("customer_id", id).order("paid_at", { ascending: false })
        .range((paymentPage - 1) * PAGE_SIZE, paymentPage * PAGE_SIZE - 1),
    ]);
    if (billsError) throw billsError;
    if (paymentsError) throw paymentsError;

    const billTotal = billCount || 0, paymentTotal = paymentCount || 0;
    const billTotals = await fetchAllRows<{ final_amount: number; amount_paid: number }>(
      supabase, "bills", id, "final_amount,amount_paid", Math.min(billTotal, SUMMARY_LIMIT),
    );
    const paymentTotals = await fetchAllRows<{ amount: number; reversed_at: string | null }>(
      supabase, "payments", id, "amount,reversed_at", Math.min(paymentTotal, SUMMARY_LIMIT),
    );
    const totalBilled = billTotals.reduce((sum, row) => sum + Number(row.final_amount || 0), 0);
    const outstanding = billTotals.reduce((sum, row) => sum + Math.max(0, Number(row.final_amount || 0) - Number(row.amount_paid || 0)), 0);
    const paymentsReceived = paymentTotals.reduce((sum, row) => sum + (row.reversed_at ? 0 : Number(row.amount || 0)), 0);

    return NextResponse.json({
      customer, currency: shop?.currency || "INR", locale: shop?.locale || "en-IN", bills: bills || [], payments: payments || [],
      summary: { invoice_count: billTotal, total_billed: totalBilled, payments_received: paymentsReceived, outstanding },
      summary_complete: billTotal <= SUMMARY_LIMIT && paymentTotal <= SUMMARY_LIMIT,
      pagination: {
        bills: { page: billPage, page_size: PAGE_SIZE, total: billTotal, total_pages: Math.max(1, Math.ceil(billTotal / PAGE_SIZE)) },
        payments: { page: paymentPage, page_size: PAGE_SIZE, total: paymentTotal, total_pages: Math.max(1, Math.ceil(paymentTotal / PAGE_SIZE)) },
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load customer ledger" }, { status: 400 });
  }
}
