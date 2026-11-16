"use client";
import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { money } from "@/lib/utils";

type Bill = { id: string; bill_number: number | null; bill_date: string; customer_name: string | null; final_amount: number; amount_paid: number };
type ReportData = Record<string, unknown> & { bills?: Bill[]; bills_total?: number; bills_truncated?: boolean };

export default function Reports() {
  const [data, setData] = useState<ReportData | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  async function load() {
    setBusy(true); setErr("");
    try {
      const p = new URLSearchParams();
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      const r = await fetch(`/api/reports?${p}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Unable to load report");
      setData(j);
    } catch (e) { setErr(e instanceof Error ? e.message : "Unable to load report"); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);

  async function exportCsv() {
    setExporting(true); setErr("");
    try {
      const p = new URLSearchParams({ export: "csv" });
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      const r = await fetch(`/api/reports?${p}`);
      if (!r.ok) { const j = await r.json(); throw new Error(j.error || "Unable to export report"); }
      const blob = await r.blob(), url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "ledger-accounts-bills.csv"; a.click(); URL.revokeObjectURL(url);
    } catch (e) { setErr(e instanceof Error ? e.message : "Unable to export report"); }
    finally { setExporting(false); }
  }

  const bills = data?.bills || [];
  const monthly = useMemo(() => {
    const months: Array<{ key: string; label: string; amount: number }> = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }), amount: 0 });
    }
    const byKey = new Map(months.map((m) => [m.key, m]));
    for (const bill of bills) {
      const d = new Date(`${bill.bill_date}T00:00:00`);
      const target = byKey.get(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      if (target) target.amount += Number(bill.final_amount || 0);
    }
    return months;
  }, [bills]);
  const maxMonthly = Math.max(1, ...monthly.map((m) => m.amount));
  const missingCostLines = Number(data?.cost_missing_lines || 0);
  const values = [
    ["Finalized invoices", Number(data?.bill_count || 0).toLocaleString(), "Bills in selected range"],
    ["Total billed", money(Number(data?.billed_value || 0)), "Invoice value including tax; not the cash received"],
    ["Net sales (excl. tax)", money(Number(data?.net_sales_ex_tax || 0)), "Finalized invoice value less tax"],
    ["Cost of goods sold", money(Number(data?.cost_of_goods_sold || 0)), "Based on saved invoice-line purchase-cost snapshots"],
    ["Estimated gross profit", money(Number(data?.estimated_gross_profit || 0)), `Estimate; ${missingCostLines} invoice lines have no recorded cost`],
    ["Estimated operating result", money(Number(data?.estimated_operating_result || 0)), "Estimated gross profit less recorded expenses"],
    ["Payments received", money(Number(data?.payments_received || 0)), "Recorded payments; excluding reversals"],
    ["Outstanding balance", money(Number(data?.outstanding || 0)), "Remaining customer balances"],
    ["Discounts", money(Number(data?.discounts || 0)), "Discounts applied"],
    ["Expenses", money(Number(data?.expenses || 0)), "Recorded active expenses"],
  ];
  return <>
    <div className="page-head"><div><div className="eyebrow">Business analytics</div><h1>Business reports</h1><div className="subtitle">Separate billed value, payments received, outstanding balance and expenses.</div></div>
      <button className="btn" onClick={exportCsv} disabled={exporting}><Download size={15}/>{exporting ? "Preparing…" : "Export all matching bills"}</button>
    </div>
    {err && <div className="notice error" style={{ marginBottom: 14 }}>{err}</div>}
    <section className="card" style={{ marginBottom: 16 }}><div className="row wrap">
      <div className="field"><label>From date</label><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)}/></div>
      <div className="field"><label>To date</label><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)}/></div>
      <button className="btn primary" style={{ alignSelf: "end" }} onClick={load} disabled={busy}>{busy ? "Loading…" : "Apply date range"}</button>
    </div></section>
    <div className="grid stats">{values.map(([title, value, caption]) => <div className="card" key={title}><div className="stat-label">{title}</div><div className="stat-value" style={{ fontSize: 21 }}>{value}</div><div className="stat-foot">{caption}</div></div>)}</div>
    <section className="card" style={{ marginTop: 18 }}>
      <h3 className="section-title">Recent monthly sales trend</h3>
      <p className="stat-foot">Calculated from the latest {bills.length} matching invoices returned for this report (maximum 500).</p>
      <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
        {monthly.map((m) => <div key={m.key} style={{ display: "grid", gridTemplateColumns: "76px minmax(0,1fr) 110px", gap: 10, alignItems: "center" }}>
          <span className="stat-foot">{m.label}</span>
          <div style={{ height: 12, background: "var(--line)", borderRadius: 20, overflow: "hidden" }}><div style={{ height: "100%", width: `${(m.amount / maxMonthly) * 100}%`, background: "var(--accent)", borderRadius: 20 }}/></div>
          <b style={{ textAlign: "right", fontSize: 12 }}>{money(m.amount)}</b>
        </div>)}
      </div>
    </section>
    <section className="card" style={{ marginTop: 18 }}>
      <h3 className="section-title">Recent sales records</h3>
      <div className="table-wrap"><table className="table"><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Final amount</th><th>Paid</th></tr></thead><tbody>
        {bills.map((b) => <tr key={b.id}><td>#{b.bill_number ?? "—"}</td><td>{b.bill_date}</td><td>{b.customer_name || "Walk-in"}</td><td>{money(Number(b.final_amount))}</td><td>{money(Number(b.amount_paid))}</td></tr>)}
      </tbody></table>{!bills.length && <div className="empty">{busy ? "Loading report…" : "No finalized invoices in the selected range."}</div>}</div>
      {data?.bills_truncated && <p className="stat-foot" style={{ marginTop: 10 }}>Showing the 500 most recent matching invoices. The CSV export includes all matching invoices up to 10,000 per export.</p>}
    </section>
  </>;
}
