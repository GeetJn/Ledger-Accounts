"use client";
import { useEffect, useState } from "react";
import { money } from "@/lib/utils";

type BillRow = Record<string, unknown>;
type PaymentRow = {
  id: string;
  bill_id: string;
  amount: number;
  method: string;
  reference?: string | null;
  paid_at: string;
  reversed_at?: string | null;
  reversal_reason?: string | null;
};

export default function Payments() {
  const [bills, setBills] = useState<BillRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [bill, setBill] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const [billResponse, paymentResponse] = await Promise.all([
      fetch("/api/bills?status=finalized"),
      fetch("/api/payments"),
    ]);
    const billJson = await billResponse.json();
    const paymentJson = await paymentResponse.json();
    if (!billResponse.ok) throw new Error(billJson.error || "Could not load bills");
    if (!paymentResponse.ok) throw new Error(paymentJson.error || "Could not load payment history");
    setBills((billJson.data || []).filter((x: BillRow) => Number(x.final_amount) > Number(x.amount_paid)));
    setPayments(paymentJson.data || []);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Could not load payment data"));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bill_id: bill, amount: Number(amount), method, reference }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      setMsg("Payment recorded successfully. The bill balance has been updated.");
      setAmount("");
      setReference("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  async function reversePayment(id: string) {
    const reason = window.prompt("Enter the reason for reversing this payment (at least 5 characters):");
    if (reason === null) return;
    if (reason.trim().length < 5) {
      setError("Enter a reversal reason of at least five characters.");
      return;
    }
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const response = await fetch(`/api/payments/${id}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      setMsg("Payment reversed. The original entry remains in the payment history.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment reversal failed");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <div className="page-head">
      <div>
        <div className="eyebrow">Cash flow</div>
        <h1>Payments & customer ledger</h1>
        <div className="subtitle">Record payments against finalized bills and review preserved payment entries.</div>
      </div>
    </div>
    {msg && <div className="notice success" style={{ marginBottom: 14 }}>{msg}</div>}
    {error && <div className="notice error" style={{ marginBottom: 14 }}>{error}</div>}

    <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.2fr)", alignItems: "start" }}>
      <form className="card" onSubmit={submit}>
        <h3 className="section-title">Record a payment</h3>
        <div className="field">
          <label>Bill</label>
          <select className="select" required value={bill} onChange={e => setBill(e.target.value)}>
            <option value="">Select outstanding bill</option>
            {bills.map(b => <option key={String(b.id)} value={String(b.id)}>#{String(b.bill_number)} · {String(b.customer_name || "Walk-in")} · Balance {money(Number(b.final_amount) - Number(b.amount_paid))}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Amount received</label>
          <input className="input" type="number" min="0.01" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        <div className="field">
          <label>Payment method</label>
          <select className="select" value={method} onChange={e => setMethod(e.target.value)}>
            {["cash", "upi", "bank_transfer", "card", "other"].map(x => <option key={x} value={x}>{x.replace("_", " ").toUpperCase()}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Transaction reference (optional)</label>
          <input className="input" value={reference} onChange={e => setReference(e.target.value)} />
        </div>
        <button className="btn primary" style={{ width: "100%", marginTop: 12 }} disabled={busy || !bill}>{busy ? "Saving…" : "Save payment"}</button>
      </form>

      <section className="card">
        <h3 className="section-title">Outstanding invoices</h3>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Bill</th><th>Customer</th><th>Amount</th><th>Paid</th><th>Balance</th></tr></thead>
            <tbody>
              {bills.map(b => <tr key={String(b.id)}>
                <td>#{String(b.bill_number)}</td>
                <td>{String(b.customer_name || "Walk-in")}</td>
                <td>{money(Number(b.final_amount))}</td>
                <td>{money(Number(b.amount_paid))}</td>
                <td><b>{money(Number(b.final_amount) - Number(b.amount_paid))}</b></td>
              </tr>)}
            </tbody>
          </table>
          {!bills.length && <div className="empty">No outstanding invoices. Great work.</div>}
        </div>
      </section>
    </div>

    <section className="card" style={{ marginTop: 18 }}>
      <h3 className="section-title">Recent payment history</h3>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Payment</th><th>Bill reference</th><th>Amount</th><th>Method</th><th>Date</th><th>Status / action</th></tr></thead>
          <tbody>
            {payments.map(p => <tr key={p.id}>
              <td>{p.id.slice(0, 8)}</td>
              <td>{p.bill_id.slice(0, 8)}</td>
              <td>{money(Number(p.amount))}</td>
              <td>{p.method.replace("_", " ").toUpperCase()}</td>
              <td>{new Date(p.paid_at).toLocaleString()}</td>
              <td>{p.reversed_at
                ? <span className="stat-foot">Reversed · {p.reversal_reason || "Reason recorded"}</span>
                : <button className="btn small" disabled={busy} onClick={() => reversePayment(p.id)}>Reverse</button>}</td>
            </tr>)}
          </tbody>
        </table>
        {!payments.length && <div className="empty">Recorded payments will appear here.</div>}
      </div>
      <p className="stat-foot" style={{ marginTop: 10 }}>Reversals preserve the original payment record and require a reason. They do not delete payment history.</p>
    </section>
  </>;
}
