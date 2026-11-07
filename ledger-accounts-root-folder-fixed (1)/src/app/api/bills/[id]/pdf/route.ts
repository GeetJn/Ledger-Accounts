import { NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { createClient } from "@/lib/supabase/server";
export const runtime = "nodejs";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; const supabase = await createClient();
    const { data: bill, error } = await supabase.from("bills").select("*,bill_items(*)").eq("id", id).single(); if (error) throw error;
    if (bill.status !== "finalized" && bill.status !== "cancelled") throw new Error("Only finalized bills have customer PDFs");
    const { data: shop } = await supabase.from("shops").select("name,phone_e164,address,tax_label,tax_identifier,currency,locale,timezone,invoice_footer").eq("id", bill.shop_id).single();
    const doc = new jsPDF({ unit: "mm", format: "a4" }); const width = 210; let y = 18;
    const line = (text: string, x = 16, size = 10, bold = false) => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.text(String(text || ""), x, y); };
    doc.setFontSize(20); doc.setFont("helvetica", "bold"); doc.text(shop?.name || "Ledger Accounts", 16, y); y += 8;
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    for (const s of [shop?.address, shop?.phone_e164, shop?.tax_identifier ? `${shop.tax_label || "Tax ID"}: ${shop.tax_identifier}` : ""].filter((s): s is string => Boolean(s))) { doc.text(String(s),16,y); y += 5; }
    y += 5; doc.setDrawColor(220); doc.line(16,y,width-16,y); y += 9;
    doc.setFont("helvetica","bold"); doc.setFontSize(15); doc.text(`INVOICE #${bill.bill_number}`,16,y); y += 8;
    doc.setFont("helvetica","normal"); doc.setFontSize(9);
    for (const s of [`Date: ${bill.bill_date}`,`Created: ${new Intl.DateTimeFormat(shop?.locale || "en-IN",{dateStyle:"full",timeStyle:"medium",timeZone:shop?.timezone || "Asia/Kolkata"}).format(new Date(bill.created_at))}`,...(bill.updated_at && new Date(bill.updated_at).getTime()>new Date(bill.created_at).getTime()+1000?[`Last updated: ${new Intl.DateTimeFormat(shop?.locale || "en-IN",{dateStyle:"medium",timeStyle:"medium",timeZone:shop?.timezone || "Asia/Kolkata"}).format(new Date(bill.updated_at))}`]:[]),`Customer: ${bill.customer_name || "Walk-in customer"}`,`Phone: ${bill.customer_phone_e164 || "—"}`,`Address: ${bill.customer_address || "—"}`]) { doc.text(s,16,y); y += 5; }
    y += 5; doc.setFillColor(245,245,245); doc.rect(16,y-5,width-32,9,"F"); doc.setFont("helvetica","bold");
    doc.text("Item",18,y); doc.text("Qty",92,y,{align:"right"}); doc.text("MRP",119,y,{align:"right"}); doc.text("Rate",145,y,{align:"right"}); doc.text("Discount",169,y,{align:"right"}); doc.text("Amount",192,y,{align:"right"}); y += 9;
    doc.setFont("helvetica","normal");
    for (const item of bill.bill_items || []) {
      if (y > 265) { doc.addPage(); y = 20; }
      doc.text(String(item.item_name).slice(0,34),18,y); doc.text(String(item.quantity),92,y,{align:"right"}); doc.text(item.show_price_discount?Number(item.mrp).toFixed(2):"—",119,y,{align:"right"}); doc.text(Number(item.rate).toFixed(2),145,y,{align:"right"}); doc.text((Number(item.discount||0)+(item.show_price_discount?Math.max(0,Number(item.mrp)-Number(item.rate))*Number(item.quantity):0)).toFixed(2),169,y,{align:"right"}); doc.text(Number(item.line_total).toFixed(2),192,y,{align:"right"}); y += 7;
    }
    y += 3; doc.setDrawColor(220); doc.line(112,y,width-16,y); y += 8;
    const curr = (n: number) => new Intl.NumberFormat(shop?.locale || "en-IN",{style:"currency",currency:shop?.currency || "INR"}).format(n);
    for (const [label,value] of [["Subtotal",bill.subtotal],["Discount",bill.discount_amount],["Tax",bill.tax_amount],["Total",bill.final_amount],["Amount paid",bill.amount_paid],["Balance",Number(bill.final_amount)-Number(bill.amount_paid)]] as Array<[string,number]>) { doc.setFont("helvetica", label === "Total" ? "bold" : "normal"); doc.text(label,132,y); doc.text(curr(Number(value)),192,y,{align:"right"}); y += 7; }
    const footer = String(shop?.invoice_footer || "Thank You!\nHave a Nice Day!").split("\n");
    if (y > 275) { doc.addPage(); y = 260; } y += 12; doc.setFont("helvetica","bold"); doc.setFontSize(11); footer.forEach((s,i)=>doc.text(s,width/2,y+i*6,{align:"center"}));
    const bytes = doc.output("arraybuffer");
    return new NextResponse(bytes, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Invoice-${bill.bill_number}.pdf"`, "Cache-Control": "private, no-store" } });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to generate PDF" }, { status: 400 }); }
}
