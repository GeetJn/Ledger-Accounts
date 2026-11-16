import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const exportTables = ["customers", "items", "expenses", "bills", "bill_items", "payments", "stock_movements"] as const;
type ExportTable = typeof exportTables[number];

async function readTable(supabase: Awaited<ReturnType<typeof createClient>>, table: ExportTable) {
  const rows: Record<string, unknown>[] = [];
  const pageSize = 1000;
  const maxRows = 20000;
  let total = 0;
  for (let start = 0; start < maxRows; start += pageSize) {
    const { data, error, count } = await supabase.from(table).select("*", { count: "exact" }).range(start, start + pageSize - 1);
    if (error) throw error;
    total = count || total;
    rows.push(...((data || []) as unknown as Record<string, unknown>[]));
    if (!data || data.length < pageSize) break;
  }
  if (total > maxRows || rows.length >= maxRows) throw new Error(`The ${table} table exceeds the 20,000-row backup limit. Use a database backup for larger accounts.`);
  return rows;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const { data: profile, error: profileError } = await supabase.from("profiles")
      .select("id,full_name,language,shop_id").eq("id", user.id).single();
    if (profileError || !profile?.shop_id) return NextResponse.json({ error: "Business profile not found" }, { status: 404 });

    const [shopResult, ...tableData] = await Promise.all([
      supabase.from("shops").select("id,name,owner_name,phone_e164,email,address,country_code,currency,locale,timezone,tax_label,tax_identifier,invoice_footer,language,default_tax_rate,created_at,updated_at").eq("id", profile.shop_id).single(),
      ...exportTables.map((table) => readTable(supabase, table)),
    ]);
    if (shopResult.error || !shopResult.data) throw shopResult.error || new Error("Business settings could not be exported");
    const data: Record<string, unknown[]> = {};
    exportTables.forEach((table, index) => { data[table] = tableData[index]; });
    const backup = {
      format: "ledger-accounts-backup", version: 1, generated_at: new Date().toISOString(),
      account: { profile, shop: shopResult.data }, data,
      notes: [
        "Includes business records visible to the signed-in account.",
        "Authentication credentials, Emergency Password hashes, owner-verification tokens, security logs and provider secrets are excluded.",
        "Files in Supabase Storage and private revision audit snapshots are not included.",
        "This is an export file, not a one-click restore package. Restore requires a separately validated import workflow.",
      ],
    };
    const filename = `ledger-accounts-backup-${profile.shop_id}-${new Date().toISOString().slice(0, 10)}.json`;
    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to export business backup" }, { status: 400 });
  }
}
