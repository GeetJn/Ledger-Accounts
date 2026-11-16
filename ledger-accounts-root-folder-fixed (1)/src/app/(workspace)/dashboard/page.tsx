import Link from "next/link";
import { ArrowUpRight, FilePlus2, Package, Users, Receipt, Sparkles, Wallet, Clock3 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/utils";

type DueBill = { id: string; bill_number: number | null; customer_name: string | null; due_date: string; final_amount: number; amount_paid: number };

export default async function Dashboard() {
  let stats = { billCount: 0, billed: 0, received: 0, outstanding: 0, products: 0, customers: 0, expenses: 0 };
  let recent: Record<string, unknown>[] = [], dueBills: DueBill[] = [];
  let name = "there", shop = "your business", currency = "INR", timezone = "Asia/Kolkata", today = new Date().toISOString().slice(0, 10);
  try {
    const s = await createClient(), { data: { user } } = await s.auth.getUser();
    if (user) {
      const { data: p } = await s.from("profiles").select("full_name,shop_id").eq("id", user.id).single();
      name = p?.full_name || user.email?.split("@")[0] || name;
      if (p?.shop_id) {
        const [{ data: b }, { data: summary }, { data: sh }, { data: due }] = await Promise.all([
          s.from("bills").select("id,bill_number,customer_name,status,final_amount,amount_paid,created_at").eq("status", "finalized").order("created_at", { ascending: false }).limit(6),
          s.rpc("business_summary", { p_from: null, p_to: null }),
          s.from("shops").select("name,currency,timezone").eq("id", p.shop_id).single(),
          s.from("bills").select("id,bill_number,customer_name,due_date,final_amount,amount_paid").eq("status", "finalized").not("due_date", "is", null).order("due_date", { ascending: true }).limit(100),
        ]);
        shop = sh?.name || shop; currency = sh?.currency || currency; timezone = sh?.timezone || timezone;
        today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
        stats = {
          billCount: Number(summary?.bill_count || 0), billed: Number(summary?.billed_value || 0),
          received: Number(summary?.payments_received || 0), outstanding: Number(summary?.outstanding || 0),
          products: Number(summary?.products || 0), customers: Number(summary?.customers || 0), expenses: Number(summary?.expenses || 0),
        };
        recent = b || [];
        dueBills = (due || []).filter((bill) => Boolean(bill.due_date) && Number(bill.final_amount) > Number(bill.amount_paid)).slice(0, 8) as DueBill[];
      }
    }
  } catch {}
  const cards = [
    ["Finalized bills", stats.billCount.toLocaleString(), "Lifetime business invoices"],
    ["Total billed", money(stats.billed, currency), "Finalized invoice value"],
    ["Payments received", money(stats.received, currency), "Recorded against invoices"],
    ["Outstanding", money(stats.outstanding, currency), "Remaining customer balances"],
    ["Products", stats.products.toLocaleString(), "Active catalogue items"],
    ["Customers", stats.customers.toLocaleString(), "Saved customer profiles"],
    ["Expenses", money(stats.expenses, currency), "Active recorded expenses"],
  ];
  return <>
    <div className="page-head"><div><div className="eyebrow">Dashboard · {shop}</div><h1>Good day, {name}</h1><div className="subtitle">Here is an overview of your business activity.</div></div><Link className="btn primary" href="/create-bill"><FilePlus2 size={15}/>Create Bill</Link></div>
    <div className="grid stats">{cards.map(([label, value, foot]) => <div className="card" key={label}><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-foot">{foot}</div></div>)}</div>
    <div className="grid" style={{ gridTemplateColumns: "minmax(0,1.6fr) minmax(260px,1fr)" }}>
      <section className="card"><div className="row between"><h3 className="section-title">Recent bills</h3><Link href="/bills" className="row muted" style={{ fontSize: 11 }}>View all <ArrowUpRight size={14}/></Link></div><div className="table-wrap"><table className="table"><thead><tr><th>Bill</th><th>Customer</th><th>Date</th><th>Amount</th></tr></thead><tbody>{recent.map((b) => <tr key={String(b.id)}><td>#{String(b.bill_number ?? "")}</td><td>{String(b.customer_name || "Walk-in")}</td><td>{new Date(String(b.created_at)).toLocaleDateString()}</td><td>{money(Number(b.final_amount || 0), currency)}</td></tr>)}</tbody></table>{!recent.length && <div className="empty">Your finalized bills will appear here.</div>}</div></section>
      <section className="card"><h3 className="section-title">Quick actions</h3><div className="grid" style={{ gap: 8 }}>
        <Link href="/items" className="nav-link" style={{ border: "1px solid var(--line)", margin: 0 }}><Package size={16}/>Add items<ArrowUpRight size={13} style={{ marginLeft: "auto" }}/></Link>
        <Link href="/customers" className="nav-link" style={{ border: "1px solid var(--line)", margin: 0 }}><Users size={16}/>Customers<ArrowUpRight size={13} style={{ marginLeft: "auto" }}/></Link>
        <Link href="/payments" className="nav-link" style={{ border: "1px solid var(--line)", margin: 0 }}><Wallet size={16}/>Record payment<ArrowUpRight size={13} style={{ marginLeft: "auto" }}/></Link>
        <Link href="/expenses" className="nav-link" style={{ border: "1px solid var(--line)", margin: 0 }}><Receipt size={16}/>Add expense<ArrowUpRight size={13} style={{ marginLeft: "auto" }}/></Link>
        <Link href="/ledger-ai" className="nav-link" style={{ border: "1px solid var(--line)", margin: 0 }}><Sparkles size={16}/>Ask Ledger AI<ArrowUpRight size={13} style={{ marginLeft: "auto" }}/></Link>
      </div></section>
    </div>
    <section className="card" style={{ marginTop: 18 }}>
      <div className="row between"><h3 className="section-title"><Clock3 size={16}/>Due-date reminders</h3><Link href="/payments" className="btn small">Review balances</Link></div>
      {dueBills.length ? <div className="table-wrap"><table className="table"><thead><tr><th>Invoice</th><th>Customer</th><th>Due date</th><th>Balance</th><th>Status</th></tr></thead><tbody>
        {dueBills.map((bill) => { const overdue = bill.due_date < today; return <tr key={bill.id}><td>#{bill.bill_number ?? "—"}</td><td>{bill.customer_name || "Walk-in"}</td><td>{bill.due_date}</td><td><b>{money(Number(bill.final_amount) - Number(bill.amount_paid), currency)}</b></td><td><span className={`badge ${overdue ? "warning" : ""}`}>{overdue ? "Overdue" : "Due soon"}</span></td></tr>; })}
      </tbody></table></div> : <div className="empty">No outstanding invoices with a due date.</div>}
      <p className="stat-foot" style={{ marginTop: 10 }}>These are in-app reminders based on invoice due dates. Automatic email or SMS notifications are not enabled.</p>
    </section>
  </>;
}
