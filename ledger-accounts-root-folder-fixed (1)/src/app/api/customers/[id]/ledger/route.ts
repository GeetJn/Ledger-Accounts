import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("id,name,phone_e164,email,address")
      .eq("id", id)
      .is("archived_at", null)
      .single();
    if (customerError || !customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const [{ data: bills, error: billsError }, { data: payments, error: paymentsError }] = await Promise.all([
      supabase.from("bills")
        .select("id,bill_number,bill_date,due_date,status,final_amount,amount_paid,discount_amount")
        .eq("customer_id", id)
        .eq("status", "finalized")
        .order("bill_date", { ascending: false })
        .limit(500),
      supabase.from("payments")
        .select("id,bill_id,amount,method,reference,notes,paid_at,reversed_at,reversal_reason")
        .eq("customer_id", id)
        .order("paid_at", { ascending: false })
        .limit(500),
    ]);
    if (billsError) throw billsError;
    if (paymentsError) throw paymentsError;

    const totalBilled = (bills || []).reduce((sum, bill) => sum + Number(bill.final_amount || 0), 0);
    const outstanding = (bills || []).reduce((sum, bill) =>
      sum + Math.max(0, Number(bill.final_amount || 0) - Number(bill.amount_paid || 0)), 0);
    const paymentsReceived = (payments || []).reduce((sum, payment) =>
      sum + (payment.reversed_at ? 0 : Number(payment.amount || 0)), 0);

    return NextResponse.json({
      customer,
      bills: bills || [],
      payments: payments || [],
      summary: {
        invoice_count: (bills || []).length,
        total_billed: totalBilled,
        payments_received: paymentsReceived,
        outstanding,
      },
      coverage_limit: 500,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to load customer ledger",
    }, { status: 400 });
  }
}
