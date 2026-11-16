export type ReportLine = {
  item_name: string;
  quantity: number;
  line_total: number;
};

export type ReportBill = {
  id: string;
  bill_number: number | null;
  bill_date: string;
  customer_name: string | null;
  final_amount: number;
  amount_paid: number;
  bill_items?: ReportLine[] | null;
};

export type ReportAnalytics = {
  monthly_sales: Array<{ key: string; label: string; sales: number }>;
  top_customers: Array<{ name: string; invoice_count: number; billed: number }>;
  top_items: Array<{ name: string; quantity: number; sales: number }>;
  analytics_truncated: boolean;
  monthly_range_truncated: boolean;
};

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

export function buildReportAnalytics(
  rows: ReportBill[],
  total: number,
  from: string | null,
  to: string | null,
  now = new Date(),
): ReportAnalytics {
  const customers = new Map<string, { name: string; invoice_count: number; billed: number }>();
  const items = new Map<string, { name: string; quantity: number; sales: number }>();

  const endMonth = (to || now.toISOString().slice(0, 10)).slice(0, 7);
  const defaultStart = new Date(Number(endMonth.slice(0, 4)), Number(endMonth.slice(5, 7)) - 6, 1);
  const defaultStartKey = defaultStart.getFullYear() + "-" + String(defaultStart.getMonth() + 1).padStart(2, "0");
  const startMonth = from ? from.slice(0, 7) : defaultStartKey;
  const finish = new Date(Number(endMonth.slice(0, 4)), Number(endMonth.slice(5, 7)) - 1, 1);
  let cursor = new Date(Number(startMonth.slice(0, 4)), Number(startMonth.slice(5, 7)) - 1, 1);
  const monthSpan = (finish.getFullYear() - cursor.getFullYear()) * 12 + finish.getMonth() - cursor.getMonth() + 1;
  const monthlyRangeTruncated = monthSpan > 60;
  if (monthlyRangeTruncated) cursor = new Date(finish.getFullYear(), finish.getMonth() - 59, 1);

  const monthly: Array<{ key: string; label: string; sales: number }> = [];
  const monthIndex = new Map<string, number>();
  while (cursor <= finish && monthly.length < 60) {
    const key = cursor.getFullYear() + "-" + String(cursor.getMonth() + 1).padStart(2, "0");
    monthIndex.set(key, monthly.length);
    monthly.push({ key, label: monthLabel(key), sales: 0 });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  for (const bill of rows) {
    const billed = Number(bill.final_amount || 0);
    const customerName = (bill.customer_name || "Walk-in customer").trim() || "Walk-in customer";
    const existingCustomer = customers.get(customerName) || { name: customerName, invoice_count: 0, billed: 0 };
    existingCustomer.invoice_count += 1;
    existingCustomer.billed += billed;
    customers.set(customerName, existingCustomer);

    const month = monthIndex.get(String(bill.bill_date).slice(0, 7));
    if (month !== undefined) monthly[month].sales += billed;

    for (const line of bill.bill_items || []) {
      const itemName = (line.item_name || "Unnamed item").trim() || "Unnamed item";
      const existingItem = items.get(itemName) || { name: itemName, quantity: 0, sales: 0 };
      existingItem.quantity += Number(line.quantity || 0);
      existingItem.sales += Number(line.line_total || 0);
      items.set(itemName, existingItem);
    }
  }

  return {
    monthly_sales: monthly,
    top_customers: Array.from(customers.values()).sort((a, b) => b.billed - a.billed).slice(0, 8),
    top_items: Array.from(items.values()).sort((a, b) => b.sales - a.sales).slice(0, 8),
    analytics_truncated: total > rows.length,
    monthly_range_truncated: monthlyRangeTruncated,
  };
}
