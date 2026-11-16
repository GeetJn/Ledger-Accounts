"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FileDown } from "lucide-react";
import { money } from "@/lib/utils";

type BillRow = { id: string; bill_number: number | null; bill_date: string; due_date: string | null; final_amount: number; amount_paid: number; status: string };
type PaymentRow = { id: string; bill_id: string; amount: number; method: string; reference: string | null; paid_at: string; reversed_at: string | null; reversal_reason: string | null };
type LedgerData = {
  customer: { id: string; name: string; phone_e164: string | null; email: string | null; address: string | null };
  bills: BillRow[];
  payments: PaymentRow[];
  summary: { invoice_count: number; total_billed: number; payments_received: number; outstanding: number };
  summary_complete: boolean;
  pagination: {
    bills: { page: number; page_size: number; total: number; total_pages: number };
    payments: { page: number; page_size: number; total: number; total_pages: number };
  };
};

export default function CustomerLedgerPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<LedgerData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [billPage, setBillPage] = useState(1);
  const [paymentPage, setPaymentPage] = useState(1);

  useEffect(() => {
    let active = true;
    (async () => {
      setBusy(true);
      try {
        const query = new URLSearchParams({ bill_page: String(billPage), payment_page: String(paymentPage) });
        const response = await fetch(`/api/customers/${encodeURIComponent(params.id)}/ledger?${query}`);
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Unable to load customer ledger");
        if (active) { setData(json); setError(""); }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Unable to load customer ledger");
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => { active = false; };
  }, [params.id, billPage, paymentPage]);

  async function exportStatement() {
    if (!data) return;
    setExporting(true); setError("");
    try {
      const allBills: BillRow[] = [], allPayments: PaymentRow[] = [];
      for (let page = 1; page <= data.pagination.bills.total_pages; page++) {
        const q = new URLSearchParams({ bill_page: String(page), payment_page: "1" });
        const r = await fetch(`/api/customers/${encodeURIComponent(params.id)}/ledger?${q}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Unable to prepare statement");
        allBills.push(...(j.bills || []));
      }
      for (let page = 1; page <= data.pagination.payments.total_pages; page++) {
        const q = new URLSearchParams({ bill_page: "1", payment_page: String(page) });
        const r = await fetch(`/api/customers/${encodeURIComponent(params.id)}/ledger?${q}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Unable to prepare statement");
        allPayments.push(...(j.payments || []));
      }
      const rows: unknown[][] = [
        ["Type", "Date", "Reference", "Amount", "Paid", "Balance", "Status / method"],
        ...allBills.map((bill) => ["Invoice", bill.bill_date, bill.bill_number ?? bill.id, bill.final_amount, bill.amount_paid,
          Math.max(0, Number(bill.final_amount) - Number(bill.amount_paid)), bill.status]),
        ...allPayments.map((payment) => ["Payment", payment.paid_at, payment.bill_id, payment.amount,
          payment.reversed_at ? 0 : payment.amount, "", payment.reversed_at ? "Reversed" : payment.method]),
      ];
      const csv = rows.map((row) => row.map((value) => {
        const raw = String(value ?? "");
        const safe = /^[\s]*[=+@-]/.test(raw) ? "'" + raw : raw;
        return '"' + safe.replaceAll('"', '""') + '"';
      }).join(",")).join("\r\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = `customer-ledger-${data.customer.id}.csv`; link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to export statement");
    } finally { setExporting(false); }
  }

  if (busy && !data) return <div className="card">Loading customer ledger…</div>;
  if (error && !data) return <div><div className="notice error">{error}</div><Link className="btn" href="/customers">Back to customers</Link></div>;
  if (!data) return <div className="empty">Customer not found.</div>;
  const { customer, bills, payments, summary, pagination } = data;
  return <>
    <div className="page-head">
      <div><div className="eyebrow">Customer account</div><h1>{customer.name}</h1><div className="subtitle">{[customer.phone_e164, customer.email, customer.address].filter(Boolean).join(" · ") || "Customer ledger and payment history"}</div></div>
      <div className="row"><button className="btn" onClick={exportStatement} disabled={exporting}><FileDown size={15}/>{exporting ? "Preparing…" : "Export statement"}</button><Link className="btn" href="/customers">Back</Link></div>
    </div>
    {error && <div className="notice error" style={{ marginBottom: 14 }}>{error}</div>}
    <div className="grid stats">
      <div className="card"><div className="stat-label">Invoices</div><div className="stat-value">{summary.invoice_count.toLocaleString()}</div><div className="stat-foot">Finalized invoices</div></div>
      <div className="card"><div className="stat-label">Total billed</div><div className="stat-value">{money(summary.total_billed)}</div><div className="stat-foot">Invoice value</div></div>
      <div className="card"><div className="stat-label">Payments received</div><div className="stat-value">{money(summary.payments_received)}</div><div className="stat-foot">Excludes reversed payments</div></div>
      <div className="card"><div className="stat-label">Outstanding</div><div className="stat-value">{money(summary.outstanding)}</div><div className="stat-foot">Remaining invoice balance</div></div>
    </div>
    {!data.summary_complete && <div className="notice" style={{ marginTop: 14 }}>This customer has more than 10,000 ledger entries. Summary totals include the first 10,000 rows; contact support for a full historical reconciliation.</div>}
    <section className="card" style={{ marginTop: 18 }}>
      <h3 className="section-title">Invoice history</h3>
      <div className="table-wrap"><table className="table"><thead><tr><th>Invoice</th><th>Date</th><th>Due date</th><th>Total</th><th>Paid</th><th>Balance</th><th></th></tr></thead><tbody>
        {bills.map((bill) => <tr key={bill.id}><td>#{bill.bill_number ?? "—"}</td><td>{bill.bill_date}</td><td>{bill.due_date || "—"}</td><td>{money(Number(bill.final_amount))}</td><td>{money(Number(bill.amount_paid))}</td><td>{money(Math.max(0, Number(bill.final_amount) - Number(bill.amount_paid)))}</td><td><Link className="btn small" href={`/create-bill?id=${bill.id}`}>Open</Link></td></tr>)}
      </tbody></table>{!bills.length && <div className="empty">No finalized invoices for this customer yet.</div>}</div>
      <div className="row between" style={{ marginTop: 12 }}><span className="stat-foot">Page {pagination.bills.page} of {pagination.bills.total_pages} · {pagination.bills.total} invoices</span><div className="row"><button className="btn small" disabled={billPage <= 1 || busy} onClick={() => setBillPage((v) => Math.max(1, v - 1))}>Previous</button><button className="btn small" disabled={billPage >= pagination.bills.total_pages || busy} onClick={() => setBillPage((v) => v + 1)}>Next</button></div></div>
    </section>
    <section className="card" style={{ marginTop: 18 }}>
      <h3 className="section-title">Payment history</h3>
      <div className="table-wrap"><table className="table"><thead><tr><th>Date</th><th>Invoice ID</th><th>Method</th><th>Amount</th><th>Status</th><th>Reason</th></tr></thead><tbody>
        {payments.map((payment) => <tr key={payment.id}><td>{new Date(payment.paid_at).toLocaleString()}</td><td>{payment.bill_id.slice(0, 8)}…</td><td>{payment.method.replaceAll("_", " ")}</td><td>{money(Number(payment.amount))}</td><td>{payment.reversed_at ? "Reversed" : "Received"}</td><td>{payment.reversal_reason || "—"}</td></tr>)}
      </tbody></table>{!payments.length && <div className="empty">No payments recorded for this customer.</div>}</div>
      <div className="row between" style={{ marginTop: 12 }}><span className="stat-foot">Page {pagination.payments.page} of {pagination.payments.total_pages} · {pagination.payments.total} payments</span><div className="row"><button className="btn small" disabled={paymentPage <= 1 || busy} onClick={() => setPaymentPage((v) => Math.max(1, v - 1))}>Previous</button><button className="btn small" disabled={paymentPage >= pagination.payments.total_pages || busy} onClick={() => setPaymentPage((v) => v + 1)}>Next</button></div></div>
    </section>
    <p className="stat-foot" style={{ marginTop: 12 }}>Read-only customer history. Invoice and payment lists are loaded 25 entries at a time; statement export downloads all available pages.</p>
  </>;
}
