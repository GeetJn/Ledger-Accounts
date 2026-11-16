import Link from "next/link";
export default function NotFound(){return <div className="login-wrap"><div className="login-card"><h1>Page not found</h1><p className="subtitle">The page you requested does not exist.</p><Link href="/dashboard" className="btn primary">Return to dashboard</Link></div></div>;}
