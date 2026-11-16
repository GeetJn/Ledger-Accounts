import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 25;
const SUMMARY_LIMIT = 10000;
function safePage(value: string | null) {
  const n = Number(value || 1);
  return Number.isSafeInteger(n) && n > 0 ? Math.min(n, 1000000) : 1;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const search = new URL(req.url).searchParams;
    const billPage = safePage(search.get("bill_page"));
    const paymentPage = safePage(search.get("payment_page"));
    const { data: customer, error: customerError } = await supabase.from("customers")
      .select("id,name,phone_e164,email,address").eq("id", id).is("archived_at", null).single();
    if (customerError || !customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

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

    const billTotals: Array<{ final_amount: number; amount_paid: number }> = [];
    const paymentTotals: Array<{ amount: number; reversed_at: string | null }> = [];
    const billTotal = billCount || 0, paymentTotal = paymentCount || 0;
    for (let start = 0; start < Math.min(billTotal, SUMMARY_LIMIT); start += 1000) {
      const { data, error } = await supabase.from("bills").select("final_amount,amount_paid")
        .eq("customer_id", id).eq("status", "finalized").order("bill_date", { ascending: false })
        .range(start, Math.min(start + 999, SUMMARY_LIMIT - 1));
      if (error) throw error;
      billTotals.push(...(data || []));
    }
    for (let start = 0; start < Math.min(paymentTotal, SUMMARY_LIMIT); start += 1000) {
      const { data, error } = await supabase.from("payments").select("amount,reversed_at")
        .eq("customer_id", id).order("paid_at", { ascending: false })
        .range(start, Math.min(start + 999, SUMMARY_LIMIT - 1));
      if (error) throw error;
      paymentTotals.push(...(data || []));
    }
    const totalBilled = billTotals.reduce((sum, row) => sum + Number(row.final_amount || 0), 0);
    const outstanding = billTotals.reduce((sum, row) => sum + Math.max(0, Number(row.final_amount || 0) - Number(row.amount_paid || 0)), 0);
    const paymentsReceived = paymentTotals.reduce((sum, row) => sum + (row.reversed_at ? 0 : Number(row.amount || 0)), 0);

    return NextResponse.json({
      customer, bills: bills || [], payments: payments || [],
      summary: { invoice_count: billCount || 0, total_billed: totalBilled, payments_received: paymentsReceived, outstanding },
      summary_complete: billTotal <= SUMMARY_LIMIT && paymentTotal <= SUMMARY_LIMIT,
      pagination: {
        bills: { page: billPage, page_size: PAGE_SIZE, total: billCount || 0, total_pages: Math.max(1, Math.ceil((billCount || 0) / PAGE_SIZE)) },
        payments: { page: paymentPage, page_size: PAGE_SIZE, total: paymentCount || 0, total_pages: Math.max(1, Math.ceil((paymentCount || 0) / PAGE_SIZE)) },
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load customer ledger" }, { status: 400 });
  }
}
