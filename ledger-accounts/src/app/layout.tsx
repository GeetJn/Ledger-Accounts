import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Ledger Accounts · Business management", description: "Simple business billing, customer records and accounting.", manifest: "/manifest.webmanifest", applicationName:"Ledger Accounts" };
export const viewport: Viewport = { themeColor:"#f6f7f8", width:"device-width", initialScale:1 };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
