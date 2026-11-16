"use client";

import { useEffect, useState } from "react";
import { Download, FileText } from "lucide-react";
import { jsPDF } from "jspdf";
import { money } from "@/lib/utils";

type Bill = { id: string; bill_number: number | null; bill_date: string; customer_name: string | null; final_amount: number; amount_paid: number };
type MonthlySales = { key: string; label: string; sales: number };
type RankedCustomer = { name: string; invoice_count: number; billed: number };
type RankedItem = { name: string; quantity: number; sales: number };
type ReportData = Record<string, unknown> & {
  bills?: Bill[];
  bills_total?: number;
  bills_truncated?: boolean;
  monthly_sales?: MonthlySales[];
  top_customers?: RankedCustomer[];
  top_items?: RankedItem[];
  analytics_truncated?: boolean;
  monthly_range_truncated?: boolean;
};

export default function Reports() {
  const [data, setData] = useState<ReportData | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const currency = String(data?.currency || "INR");
  const locale = String(data?.locale || "en-IN");
  const formatMoney = (value: number) => formatMoney(value, currency, locale);

  async function load() {
    setBusy(true);
    setErr("");
    try {
      const p = new URLSearchParams();
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      const r = await fetch("/api/reports?" + p.toString());
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Unable to load report");
      setData(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unable to load report");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function exportCsv() {
    setExporting(true);
    setErr("");
    try {
      const p = new URLSearchParams({ export: "csv" });
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      const r = await fetch("/api/reports?" + p.toString());
      if (!r.ok) {
        const j = await r.json();
        throw new Error(j.error || "Unable to export report");
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ledger-accounts-bills.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unable to export report");
    } finally {
      setExporting(false);
    }
  }

  function exportPdf() {
    if (!data) {
      setErr("Load the report before exporting it.");
      return;
    }
    setPdfBusy(true);
    setErr("");
    try {
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 16;
      let y = 18;

      function ensureSpace(height: number) {
        if (y + height > pageHeight - 17) {
          doc.addPage();
          y = 18;
        }
      }
      function heading(value: string) {
        ensureSpace(10);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text(value, margin, y);
        y += 7;
      }
      function row(label: string, value: string) {
        const lines = doc.splitTextToSize(value, pageWidth - margin * 2 - 56);
        const height = Math.max(6, lines.length * 4.5);
        ensureSpace(height + 1);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text(label, margin, y);
        doc.setFont("helvetica", "normal");
        doc.text(lines, margin + 56, y);
        y += height;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(19);
      doc.text("Business Report", margin, y);
      y += 8;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const range = (from || "Beginning") + " to " + (to || "Today");
      doc.text("Period: " + range, margin, y);
      doc.text("Generated: " + new Date().toLocaleString(), margin, y + 5);
      y += 13;

      heading("Financial summary");
      const metrics: Array<[string, string]> = [
        ["Finalized invoices", Number(data.bill_count || 0).toLocaleString()],
        ["Total billed", formatMoney(Number(data.billed_value || 0))],
        ["Net sales excluding tax", formatMoney(Number(data.net_sales_ex_tax || 0))],
        ["Cost of goods sold", formatMoney(Number(data.cost_of_goods_sold || 0))],
        ["Estimated gross profit", formatMoney(Number(data.estimated_gross_profit || 0))],
        ["Estimated operating result", formatMoney(Number(data.estimated_operating_result || 0))],
        ["Payments received", formatMoney(Number(data.payments_received || 0))],
        ["Outstanding balance", formatMoney(Number(data.outstanding || 0))],
        ["Discounts", formatMoney(Number(data.discounts || 0))],
        ["Expenses", formatMoney(Number(data.expenses || 0))],
      ];
      for (const [label, value] of metrics) row(label, value);

      heading("Monthly sales trend");
      for (const month of data.monthly_sales || []) row(month.label, formatMoney(Number(month.sales || 0)));

      heading("Top customers by billed value");
      for (const customer of data.top_customers || []) {
        row(customer.name, formatMoney(Number(customer.billed || 0)) + " · " + customer.invoice_count + " invoices");
      }

      heading("Top products by sales value");
      for (const item of data.top_items || []) {
        row(item.name, formatMoney(Number(item.sales || 0)) + " · Quantity " + Number(item.quantity || 0).toLocaleString());
      }

      if (data.analytics_truncated) {
        ensureSpace(14);
        doc.setFontSize(8);
        doc.text("Ranking and trend analysis uses the most recent 10,000 matching invoices.", margin, y);
        y += 5;
      }
      if (data.monthly_range_truncated) {
        ensureSpace(10);
        doc.setFontSize(8);
        doc.text("The displayed monthly trend is capped at 60 months.", margin, y);
      }

      const pageCount = doc.getNumberOfPages();
      for (let page = 1; page <= pageCount; page++) {
        doc.setPage(page);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(110);
        doc.text("Ledger Accounts · Page " + page + " of " + pageCount, pageWidth - margin, pageHeight - 8, { align: "right" });
      }
      doc.save("ledger-accounts-business-report.pdf");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unable to create PDF report");
    } finally {
      setPdfBusy(false);
    }
  }

  const bills = data?.bills || [];
  const monthly = data?.monthly_sales || [];
  const maxMonthly = Math.max(1, ...monthly.map((m) => Number(m.sales || 0)));
  const missingCostLines = Number(data?.cost_missing_lines || 0);
  const values: Array<[string, string, string]> = [
    ["Finalized invoices", Number(data?.bill_count || 0).toLocaleString(), "Bills in selected range"],
    ["Total billed", formatMoney(Number(data?.billed_value || 0)), "Invoice value including tax; not cash received"],
    ["Net sales (excl. tax)", formatMoney(Number(data?.net_sales_ex_tax || 0)), "Finalized invoice value less tax"],
    ["Cost of goods sold", formatMoney(Number(data?.cost_of_goods_sold || 0)), "Based on saved invoice-line purchase-cost snapshots"],
    ["Estimated gross profit", formatMoney(Number(data?.estimated_gross_profit || 0)), "Estimate; " + missingCostLines + " invoice lines have no recorded cost"],
    ["Estimated operating result", formatMoney(Number(data?.estimated_operating_result || 0)), "Estimated gross profit less recorded expenses"],
    ["Payments received", formatMoney(Number(data?.payments_received || 0)), "Recorded payments; excluding reversals"],
    ["Outstanding balance", formatMoney(Number(data?.outstanding || 0)), "Remaining customer balances"],
    ["Discounts", formatMoney(Number(data?.discounts || 0)), "Discounts applied"],
    ["Expenses", formatMoney(Number(data?.expenses || 0)), "Recorded active expenses"],
  ];

  return <>
    <div className="page-head">
      <div><div className="eyebrow">Business analytics</div><h1>Business reports</h1><div className="subtitle">Separate billed value, payments received, outstanding balance and expenses.</div></div>
      <div className="row wrap">
        <button className="btn" onClick={exportPdf} disabled={pdfBusy || !data}><FileText size={15}/>{pdfBusy ? "Preparing…" : "Export PDF report"}</button>
        <button className="btn" onClick={exportCsv} disabled={exporting}><Download size={15}/>{exporting ? "Preparing…" : "Export bills CSV"}</button>
      </div>
    </div>
    {err && <div className="notice error" style={{ marginBottom: 14 }}>{err}</div>}
    <section className="card" style={{ marginBottom: 16 }}>
      <div className="row wrap">
        <div className="field"><label>From date</label><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)}/></div>
        <div className="field"><label>To date</label><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)}/></div>
        <button className="btn primary" style={{ alignSelf: "end" }} onClick={load} disabled={busy}>{busy ? "Loading…" : "Apply date range"}</button>
      </div>
    </section>
    <div className="grid stats">
      {values.map(([title, value, caption]) => <div className="card" key={title}><div className="stat-label">{title}</div><div className="stat-value" style={{ fontSize: 21 }}>{value}</div><div className="stat-foot">{caption}</div></div>)}
    </div>
    <section className="card" style={{ marginTop: 18 }}>
      <h3 className="section-title">Monthly sales trend</h3>
      <p className="stat-foot">Monthly totals are aggregated across the matching invoice sample, not just the 500 invoices shown below.</p>
      <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
        {monthly.map((m) => <div key={m.key} style={{ display: "grid", gridTemplateColumns: "76px minmax(0,1fr) 110px", gap: 10, alignItems: "center" }}>
          <span className="stat-foot">{m.label}</span>
          <div style={{ height: 12, background: "var(--line)", borderRadius: 20, overflow: "hidden" }}><div style={{ height: "100%", width: (Number(m.sales || 0) / maxMonthly * 100) + "%", background: "var(--accent)", borderRadius: 20 }}/></div>
          <b style={{ textAlign: "right", fontSize: 12 }}>{formatMoney(Number(m.sales || 0))}</b>
        </div>)}
        {!monthly.length && <div className="empty">No monthly sales data in the selected range.</div>}
      </div>
      {data?.analytics_truncated && <p className="stat-foot" style={{ marginTop: 10 }}>Trend and rankings use the most recent 10,000 matching invoices. Summary totals above are calculated over the full selected range.</p>}
      {data?.monthly_range_truncated && <p className="stat-foot" style={{ marginTop: 6 }}>The trend is limited to the most recent 60 months of the selected date range.</p>}
    </section>
    <div className="grid" style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))", marginTop: 18 }}>
      <section className="card">
        <h3 className="section-title">Top customers by billed value</h3>
        <div className="table-wrap"><table className="table"><thead><tr><th>Customer</th><th>Invoices</th><th>Billed</th></tr></thead><tbody>
          {(data?.top_customers || []).map((customer) => <tr key={customer.name}><td>{customer.name}</td><td>{customer.invoice_count}</td><td>{formatMoney(Number(customer.billed || 0))}</td></tr>)}
        </tbody></table>{!data?.top_customers?.length && <div className="empty">No customer ranking data.</div>}</div>
      </section>
      <section className="card">
        <h3 className="section-title">Top products by sales value</h3>
        <div className="table-wrap"><table className="table"><thead><tr><th>Product</th><th>Quantity</th><th>Sales</th></tr></thead><tbody>
          {(data?.top_items || []).map((item) => <tr key={item.name}><td>{item.name}</td><td>{Number(item.quantity || 0).toLocaleString()}</td><td>{formatMoney(Number(item.sales || 0))}</td></tr>)}
        </tbody></table>{!data?.top_items?.length && <div className="empty">No product ranking data.</div>}</div>
      </section>
    </div>
    <section className="card" style={{ marginTop: 18 }}>
      <h3 className="section-title">Recent sales records</h3>
      <div className="table-wrap"><table className="table"><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Final amount</th><th>Paid</th></tr></thead><tbody>
        {bills.map((b) => <tr key={b.id}><td>#{b.bill_number ?? "—"}</td><td>{b.bill_date}</td><td>{b.customer_name || "Walk-in"}</td><td>{formatMoney(Number(b.final_amount))}</td><td>{formatMoney(Number(b.amount_paid))}</td></tr>)}
      </tbody></table>{!bills.length && <div className="empty">{busy ? "Loading report…" : "No finalized invoices in the selected range."}</div>}</div>
      {data?.bills_truncated && <p className="stat-foot" style={{ marginTop: 10 }}>Showing the 500 most recent matching invoices. The CSV export includes all matching invoices up to 10,000 per export.</p>}
    </section>
  </>;
}
