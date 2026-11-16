"use client";
import { useState } from "react";
import { ShieldCheck, Search, ChevronDown, ChevronRight } from "lucide-react";

type JsonRecord = Record<string, unknown>;
const fieldLabels: Record<string, string> = {
  customer_name: "Customer", customer_phone_e164: "Customer phone", customer_address: "Customer address",
  bill_title: "Bill title", bill_date: "Bill date", due_date: "Due date", tax_rate: "Tax rate",
  subtotal: "Subtotal", discount_amount: "Discount", tax_amount: "Tax", final_amount: "Final amount",
  amount_paid: "Amount paid", notes: "Notes", status: "Status",
};
function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}
function displayValue(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "tax_rate") return `${String(value)}%`;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function BillHistory() {
  const [verified, setVerified] = useState(false);
  const [method, setMethod] = useState("normal");
  const [password, setPassword] = useState("");
  const [number, setNumber] = useState("");
  const [data, setData] = useState<JsonRecord[] | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function verify(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const r = await fetch("/api/bill-history/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method, password, purpose: "bill_history" }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setVerified(true); setPassword(""); setMessage("Identity verified. This private history session expires in 10 minutes.");
    } catch (e) { setError(e instanceof Error ? e.message : "Verification failed"); }
    finally { setBusy(false); }
  }

  async function search(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setMessage(""); setData(null);
    try {
      const r = await fetch(`/api/bill-history/search?bill_number=${encodeURIComponent(number)}`);
      const j = await r.json();
      if (r.status === 403) { setVerified(false); throw new Error(j.error || "Verification expired. Enter your password again."); }
      if (!r.ok) throw new Error(j.error);
      if (!j.data) setMessage(j.message || "No bill found with this bill number.");
      else setData(j.data);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not find bill history"); }
    finally { setBusy(false); }
  }

  const original = asRecord(data?.[0]?.original_data);
  const originalBill = asRecord(original.bill);
  const originalItems = Array.isArray(original.items) ? original.items.map(asRecord) : [];
  return <>
    <div className="page-head"><div><div className="eyebrow">Private owner audit</div><h1>Bill altering history</h1><div className="subtitle">This section contains internal bill revisions and is not included in customer invoices.</div></div><span className="badge warning">Owner only</span></div>
    {!verified ? <form className="card" style={{ maxWidth: 520 }} onSubmit={verify}>
      <div className="row" style={{ marginBottom: 15 }}><ShieldCheck size={20}/><h3 className="section-title" style={{ margin: 0 }}>Verify to open private history</h3></div>
      <p className="subtitle">Enter your normal password or choose your Emergency Password. Login alone is not sufficient. Successful access expires after 10 minutes.</p>
      <div className="field"><label>Verification method</label><select className="select" value={method} onChange={(e) => setMethod(e.target.value)}><option value="normal">Normal Password</option><option value="emergency">Emergency Password</option></select></div>
      <div className="field"><label>{method === "normal" ? "Normal Password" : "Emergency Password"}</label><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password"/></div>
      <button className="btn primary" style={{ width: "100%", marginTop: 10 }} disabled={busy}>{busy ? "Verifying…" : "Verify and open history"}</button>
    </form> : <>
      <div className="notice" style={{ marginBottom: 15 }}>{message || "Private owner history access is active. Reverify after expiry."}</div>
      <form className="card" onSubmit={search} style={{ maxWidth: 650 }}><h3 className="section-title">Search by bill number</h3><div className="row"><input className="input" type="number" min="1" step="1" value={number} onChange={(e) => setNumber(e.target.value)} required placeholder="e.g. 15"/><button className="btn primary"><Search size={14}/>Search</button></div></form>
    </>}
    {error && <div className="notice error" style={{ marginTop: 15 }}>{error}</div>}
    {message && !verified && <div className="notice" style={{ marginTop: 15 }}>{message}</div>}
    {data && <>
      <div className="grid" style={{ gap: 15, marginTop: 18 }}>
        <section className="card">
          <div className="row between"><div><div className="eyebrow">Bill number</div><h2 style={{ margin: 0, fontSize: 24 }}>#{String(originalBill.bill_number || number)}</h2></div><span className="badge success">{data.length - 1} revisions</span></div>
          <div className="divider"/>
          <div className="grid stats" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}>
            <div><div className="stat-label">Original amount</div><div className="stat-value" style={{ fontSize: 18 }}>{String(originalBill.final_amount ?? "Draft")}</div></div>
            <div><div className="stat-label">Customer</div><div style={{ fontWeight: 600, marginTop: 12 }}>{String(originalBill.customer_name || "—")}</div></div>
            <div><div className="stat-label">Created on</div><div style={{ fontWeight: 600, marginTop: 12 }}>{originalBill.created_at ? new Date(String(originalBill.created_at)).toLocaleString() : "—"}</div></div>
          </div>
        </section>
        <section className="card"><h3 className="section-title">Original items snapshot</h3><div className="table-wrap"><table className="table"><thead><tr><th>Item</th><th>Quantity</th><th>Rate</th><th>Discount</th><th>Line total</th></tr></thead><tbody>
          {originalItems.map((item, i) => <tr key={String(item.id || i)}><td>{String(item.item_name || "—")}</td><td>{String(item.quantity ?? "—")}</td><td>{String(item.rate ?? "—")}</td><td>{String(item.discount ?? "—")}</td><td>{String(item.line_total ?? "—")}</td></tr>)}
        </tbody></table>{!originalItems.length && <div className="empty">No original item snapshot is available.</div>}</div></section>
        <section className="card">
          <h3 className="section-title">Revision comparison</h3>
          {data.slice(1).length === 0 ? <div className="empty">No alterations have been recorded for this invoice.</div> : data.slice(1).map((revision, i) => {
            const previous = asRecord(revision.previous_data), updated = asRecord(revision.updated_data);
            const previousBill = asRecord(previous.bill), updatedBill = asRecord(updated.bill);
            const changedFields = Array.isArray(revision.changed_fields) ? revision.changed_fields.map(String) : [];
            const billFields = changedFields.filter((field) => field !== "items" && (field in previousBill || field in updatedBill));
            const previousItems = Array.isArray(previous.items) ? previous.items.map(asRecord) : [];
            const updatedItems = Array.isArray(updated.items) ? updated.items.map(asRecord) : [];
            return <details key={String(revision.revision_number || i)} style={{ borderBottom: "1px solid var(--line)", padding: "13px 0" }}>
              <summary style={{ cursor: "pointer", fontWeight: 650, fontSize: 13 }}>Revision {String(revision.revision_number)} · {new Date(String(revision.changed_at)).toLocaleString()} <ChevronDown size={14} style={{ float: "right" }}/></summary>
              <div className="subtitle" style={{ marginTop: 10 }}>Changed by owner · Time zone: {String(revision.timezone || "—")} · Reason: {String(revision.change_reason || "Not provided")}</div>
              <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>{changedFields.map((field) => <span className="badge" key={field}>{field === "items" ? "Line items" : fieldLabels[field] || field.replaceAll("_", " ")}</span>)}</div>
              {billFields.length > 0 && <div className="table-wrap" style={{ marginTop: 12 }}><table className="table"><thead><tr><th>Changed field</th><th>Previous value</th><th>Updated value</th></tr></thead><tbody>
                {billFields.map((field) => <tr key={field}><td><b>{fieldLabels[field] || field.replaceAll("_", " ")}</b></td><td>{displayValue(previousBill[field], field)}</td><td>{displayValue(updatedBill[field], field)}</td></tr>)}
              </tbody></table></div>}
              {changedFields.includes("items") && <div style={{ marginTop: 14 }}>
                <h4 style={{ fontSize: 13, margin: "8px 0" }}>Previous line items</h4>
                <div className="table-wrap"><table className="table"><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Discount</th><th>Line total</th></tr></thead><tbody>
                  {previousItems.map((item, n) => <tr key={String(item.id || n)}><td>{String(item.item_name || "—")}</td><td>{String(item.quantity ?? "—")}</td><td>{String(item.rate ?? "—")}</td><td>{String(item.discount ?? "—")}</td><td>{String(item.line_total ?? "—")}</td></tr>)}
                </tbody></table>{!previousItems.length && <div className="empty">No previous items.</div>}</div>
                <h4 style={{ fontSize: 13, margin: "14px 0 8px" }}>Updated line items</h4>
                <div className="table-wrap"><table className="table"><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Discount</th><th>Line total</th></tr></thead><tbody>
                  {updatedItems.map((item, n) => <tr key={String(item.id || n)}><td>{String(item.item_name || "—")}</td><td>{String(item.quantity ?? "—")}</td><td>{String(item.rate ?? "—")}</td><td>{String(item.discount ?? "—")}</td><td>{String(item.line_total ?? "—")}</td></tr>)}
                </tbody></table>{!updatedItems.length && <div className="empty">No updated items.</div>}</div>
              </div>}
              <details style={{ marginTop: 14 }}><summary style={{ cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}><ChevronRight size={13}/>View original JSON snapshots</summary>
                <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                  <div><div className="stat-label">Previous version</div><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 10, background: "#f7f8f9", padding: 12, borderRadius: 8 }}>{JSON.stringify(revision.previous_data, null, 2)}</pre></div>
                  <div><div className="stat-label">Updated version</div><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 10, background: "#f7f8f9", padding: 12, borderRadius: 8 }}>{JSON.stringify(revision.updated_data, null, 2)}</pre></div>
                </div>
              </details>
            </details>;
          })}
        </section>
      </div>
    </>}
  </>;
}
