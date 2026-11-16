import { NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const { data: payment, error: paymentError } = await supabase.from("payments")
      .select("id,bill_id,amount,method,reference,paid_at,reversed_at,reversal_reason,shop_id")
      .eq("id", id).single();
    if (paymentError || !payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

    const [{ data: bill, error: billError }, { data: shop }] = await Promise.all([
      supabase.from("bills").select("bill_number,bill_date,customer_name,customer_phone_e164,final_amount").eq("id", payment.bill_id).single(),
      supabase.from("shops").select("name,phone_e164,address,tax_label,tax_identifier,currency,locale,timezone").eq("id", payment.shop_id).single(),
    ]);
    if (billError || !bill) return NextResponse.json({ error: "Associated invoice not found" }, { status: 404 });

    const doc = new jsPDF({ unit: "mm", format: "a5" });
    const width = 148, left = 14, right = width - 14;
    let y = 18;
    const locale = shop?.locale || "en-IN", timezone = shop?.timezone || "Asia/Kolkata", currency = shop?.currency || "INR";
    const curr = (n: number) => new Intl.NumberFormat(locale, { style: "currency", currency }).format(n);
    doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.text(shop?.name || "Ledger Accounts", left, y); y += 8;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    for (const value of [shop?.address, shop?.phone_e164, shop?.tax_identifier ? `${shop.tax_label || "Tax ID"}: ${shop.tax_identifier}` : ""]) {
      if (value) { const lines = doc.splitTextToSize(String(value), right - left); doc.text(lines, left, y); y += lines.length * 4.5; }
    }
    y += 5; doc.setDrawColor(210); doc.line(left, y, right, y); y += 9;
    doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text(payment.reversed_at ? "PAYMENT REVERSAL RECORD" : "PAYMENT RECEIPT", left, y); y += 9;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    const formatDate = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(payment.paid_at));
    const rows: Array<[string, string]> = [
      ["Receipt ID", payment.id], ["Invoice", bill.bill_number ? `#${bill.bill_number}` : payment.bill_id],
      ["Invoice date", bill.bill_date || "—"], ["Paid on", formatDate],
      ["Customer", bill.customer_name || "Walk-in customer"], ["Phone", bill.customer_phone_e164 || "—"],
      ["Method", String(payment.method).replaceAll("_", " ").toUpperCase()],
      ["Reference", payment.reference || "—"], ["Amount received", curr(Number(payment.amount))],
    ];
    for (const [label, value] of rows) {
      doc.setFont("helvetica", "bold"); doc.text(label, left, y);
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(value, 75); doc.text(lines, 65, y); y += Math.max(6, lines.length * 5);
    }
    if (payment.reversed_at) {
      y += 4; doc.setTextColor(160, 45, 45); doc.setFont("helvetica", "bold"); doc.text("REVERSED", left, y); y += 6;
      doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "normal");
      const reason = doc.splitTextToSize(`Reason: ${payment.reversal_reason || "Not provided"}`, right - left);
      doc.text(reason, left, y); y += reason.length * 5;
    }
    y += 5; doc.setDrawColor(210); doc.line(left, y, right, y); y += 8;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.text(`Invoice total: ${curr(Number(bill.final_amount || 0))}`, left, y); y += 5;
    doc.text(`Generated: ${new Date().toLocaleString(locale, { timeZone: timezone })}`, left, y);
    return new NextResponse(doc.output("arraybuffer"), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Payment-Receipt-${payment.id.slice(0, 8)}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to generate payment receipt" }, { status: 400 });
  }
}
