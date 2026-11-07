"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, FilePlus2, Package, Files, Users, History, Wallet, Receipt, ChartNoAxesCombined, Sparkles, Languages, BookOpen, Settings, Download, Menu, X, LogOut, Landmark } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
const groups = [
  { label:"WORKSPACE", links:[
    ["Dashboard","/dashboard",LayoutDashboard],["Create Bill","/create-bill",FilePlus2],["Add Items","/items",Package],["Bills History","/bills",Files],["Customer History","/customers",Users],["Bill Altering History","/bill-altering-history",History],
  ]},
  { label:"MANAGEMENT", links:[
    ["Payments / Ledger","/payments",Wallet],["Expenses","/expenses",Receipt],["Business Reports","/reports",ChartNoAxesCombined],["Ledger AI","/ledger-ai",Sparkles],
  ]},
  { label:"PREFERENCES", links:[
    ["Language","/language",Languages],["App Guide","/app-guide",BookOpen],["Settings","/settings",Settings],["Download / Install App","/install",Download],
  ]},
] as const;
export default function AppShell({ children, ownerName="Business Owner", shopName="Ledger Accounts" }: {children:React.ReactNode;ownerName?:string;shopName?:string}) {
  const pathname=usePathname(); const router=useRouter(); const [open,setOpen]=useState(false);
  async function logout(){await createClient().auth.signOut();router.push("/login");router.refresh();}
  return <div className="shell">
    <div className={`mobile-overlay ${open?"show":""}`} onClick={()=>setOpen(false)} />
    <aside className={`sidebar ${open?"open":""}`}>
      <div className="brand"><span className="brand-mark"><Landmark size={19}/></span><span>LEDGER ACCOUNTS</span><button className="mobile-menu" style={{marginLeft:"auto"}} onClick={()=>setOpen(false)} aria-label="Close menu"><X size={18}/></button></div>
      {groups.map(group=><div key={group.label}><div className="nav-label">{group.label}</div>{group.links.map(([label,href,Icon])=><Link key={href} href={href} onClick={()=>setOpen(false)} className={`nav-link ${pathname===href || (href!=="/dashboard"&&pathname.startsWith(href))?"active":""}`}><Icon/><span>{label}</span></Link>)}</div>)}
      <div className="sidebar-foot"><div className="profile-chip"><div className="avatar">{(ownerName.trim()[0]||"B").toUpperCase()}</div><div style={{minWidth:0,flex:1}}><div className="profile-name">{ownerName}</div><div className="profile-sub" style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{shopName}</div></div><button className="btn ghost small" onClick={logout} title="Sign out"><LogOut size={15}/></button></div></div>
    </aside>
    <div className="main"><header className="topbar"><div className="topbar-left"><button className="mobile-menu" onClick={()=>setOpen(true)} aria-label="Open navigation"><Menu size={20}/></button><span className="topbar-title">Business workspace <span className="muted">/</span> <b style={{color:"#343d47"}}>{shopName}</b></span></div><div className="row"><span className="badge success">Owner account</span></div></header><main className="page">{children}<div className="footer-note">LEDGER ACCOUNTS · Your business records stay in your connected database.</div></main></div>
  </div>;
}
