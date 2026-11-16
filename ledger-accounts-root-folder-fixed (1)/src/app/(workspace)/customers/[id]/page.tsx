"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { money } from "@/lib/utils";

type LedgerData = {
  customer: { id: string; name: string; phone_e164: string | null; email: string | null; address: string | null };
  bills: Array<{ id: string; bill_number: number | null; bill_date: string; due_date: string | null; final_amount: number; amount_paid: number; status: string }>;
  payments: Array<{ id: string; bill_id: string; amount: number; method: string; reference: string | null; paid_at: string; reversed_at: string | null; reversal_reason: string | null }>;
  summary: { invoice_count: number; total_billed: number; payments_received: number; outstanding: number };
  coverage_limit: number;
};

export default function CustomerLedgerPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<LedgerData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch(`/api/customers/${encodeURIComponent(params.id)}/ledger`);
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Unable to load customer ledger");
        if (active) setData(json);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Unable to load customer ledger");
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => { active = false; };
  }, [params.id]);

  if (busy) return <div className="card">Loading customer ledger…</div>;
  if (error || !data) return <div><div className="notice error">{error || "Customer not found"}</div><Link className="btn" href="/customers">Back to customers</Link></div>;

  const { customer, bills, payments, summary } = data;
  function exportStatement() {
    const rows: unknown[][] = [
      ["Type", "Date", "Reference", "Amount", "Paid", "Balance", "Status / method"],
      ...bills.map(bill => ["Invoice", bill.bill_date, bill.bill_number ?? bill.id, bill.final_amount, bill.amount_paid,
        Math.max(0, Number(bill.final_amount) - Number(bill.amount_paid)), bill.status]),
      ...payments.map(payment => ["Payment", payment.paid_at, payment.bill_id, payment.amount,
        payment.reversed_at ? 0 : payment.amount, "", payment.reversed_at ? "Reversed" : payment.method]),
    ];
    const csv = rows.map(row => row.map(value => {
      const raw = String(value ?? "");
      const safe = /^[\s]*[=+\-@]/.test(raw) ? "'" + raw : raw;
      return '"' + safe.replaceAll('"', '""') + '"';
    }).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `customer-ledger-${customer.id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return <>
    <div className="page-head">
      <div>
        <div className="eyebrow">Customer account</div>
        <h1>{customer.name}</h1>
        <div className="subtitle">{[customer.phone_e164, customer.email, customer.address].filter(Boolean).join(" · ") || "Customer ledger and payment history"}</div>
      </div>
      <Link className="btn" href="/customers">Back to customers</Link>
    </div>
    <div className="grid stats">
      <div className="card"><div className="stat-label">Invoices</div><div className="stat-value">{summary.invoice_count}</div><div className="stat-foot">Finalized invoices</div></div>
      <div className="card"><div className="stat-label">Total billed</div><div className="stat-value">{money(summary.total_billed)}</div><div className="stat-foot">Invoice value</div></div>
      <div className="card"><div className="stat-label">Payments received</div><div className="stat-value">{money(summary.payments_received)}</div><div className="stat-foot">Excludes reversed payments</div></div>
      <div className="card"><div className="stat-label">Outstanding</div><div className="stat-value">{money(summary.outstanding)}</div><div className="stat-foot">Remaining invoice balance</div></div>
    </div>
    <section className="card" style={{ marginTop: 18 }}>
      <h3 className="section-title">Invoice history</h3>
      <div className="table-wrap"><table className="table"><thead><tr><th>Invoice</th><th>Date</th><th>Due date</th><th>Total</th><th>Paid</th><th>Balance</th><th></th></tr></thead><tbody>
        {bills.map(bill => <tr key={bill.id}><td>#{bill.bill_number ?? "—"}</td><td>{bill.bill_date}</td><td>{bill.due_date || "—"}</td><td>{money(Number(bill.final_amount))}</td><td>{money(Number(bill.amount_paid))}</td><td>{money(Math.max(0, Number(bill.final_amount) - Number(bill.amount_paid)))}</td><td><Link className="btn small" href={`/create-bill?id=${bill.id}`}>Open</Link></td></tr>)}
      </tbody></table>{!bills.length && <div className="empty">No finalized invoices for this customer yet.</div>}</div>
    </section>
    <section className="card" style={{ marginTop: 18 }}>
      <h3 className="section-title">Payment history</h3>
      <div className="table-wrap"><table className="table"><thead><tr><th>Date</th><th>Invoice ID</th><th>Method</th><th>Amount</th><th>Status</th><th>Reason</th></tr></thead><tbody>
        {payments.map(payment => <tr key={payment.id}><td>{new Date(payment.paid_at).toLocaleString()}</td><td>{payment.bill_id.slice(0, 8)}…</td><td>{payment.method.replaceAll("_", " ")}</td><td>{money(Number(payment.amount))}</td><td>{payment.reversed_at ? "Reversed" : "Received"}</td><td>{payment.reversal_reason || "—"}</td></tr>)}
      </tbody></table>{!payments.length && <div className="empty">No payments recorded for this customer.</div>}</div>
    </section>
    <p className="stat-foot" style={{ marginTop: 12 }}>Showing up to 500 invoices and 500 payment entries. This view is read-only.</p>
  </>;
}
