import { describe, expect, it } from "vitest";
import { buildReportAnalytics, type ReportBill } from "../src/lib/report-analytics";

describe("report analytics", () => {
  it("aggregates monthly sales, customer rankings and product rankings", () => {
    const bills: ReportBill[] = [
      {
        id: "1", bill_number: 1, bill_date: "2026-10-03", customer_name: "Asha",
        final_amount: 1200, amount_paid: 500,
        bill_items: [
          { item_name: "Notebook", quantity: 2, line_total: 200 },
          { item_name: "Pen", quantity: 5, line_total: 100 },
        ],
      },
      {
        id: "2", bill_number: 2, bill_date: "2026-10-18", customer_name: "Asha",
        final_amount: 800, amount_paid: 800,
        bill_items: [{ item_name: "Notebook", quantity: 4, line_total: 400 }],
      },
      {
        id: "3", bill_number: 3, bill_date: "2026-09-12", customer_name: "Walk-in",
        final_amount: 500, amount_paid: 0,
        bill_items: [{ item_name: "Pen", quantity: 10, line_total: 300 }],
      },
    ];

    const result = buildReportAnalytics(bills, 3, "2026-09-01", "2026-10-31");

    expect(result.monthly_sales.map((row) => [row.key, row.sales])).toEqual([
      ["2026-09", 500],
      ["2026-10", 2000],
    ]);
    expect(result.top_customers[0]).toEqual({ name: "Asha", invoice_count: 2, billed: 2000 });
    expect(result.top_items[0]).toEqual({ name: "Notebook", quantity: 6, sales: 600 });
    expect(result.analytics_truncated).toBe(false);
    expect(result.monthly_range_truncated).toBe(false);
  });

  it("defaults to six calendar months including the current month", () => {
    const result = buildReportAnalytics(
      [], 0, null, null, new Date("2026-11-17T12:00:00.000Z"),
    );
    expect(result.monthly_sales.map((row) => row.key)).toEqual([
      "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11",
    ]);
  });

  it("uses only the most recent 60 months for long report periods", () => {
    const result = buildReportAnalytics([], 0, "2010-01-01", "2025-12-31");
    expect(result.monthly_sales).toHaveLength(60);
    expect(result.monthly_sales[0].key).toBe("2021-01");
    expect(result.monthly_sales[59].key).toBe("2025-12");
    expect(result.monthly_range_truncated).toBe(true);
  });

  it("marks ranking data as partial when the invoice query is capped", () => {
    const bills: ReportBill[] = [
      { id: "1", bill_number: 1, bill_date: "2026-01-10", customer_name: null, final_amount: 100, amount_paid: 0 },
    ];
    const result = buildReportAnalytics(bills, 12000, "2026-01-01", "2026-01-31");
    expect(result.analytics_truncated).toBe(true);
    expect(result.top_customers[0].name).toBe("Walk-in customer");
  });

  it("keeps ranking lists bounded to eight entries", () => {
    const bills = Array.from({ length: 12 }, (_, i): ReportBill => ({
      id: String(i), bill_number: i + 1, bill_date: "2026-10-01", customer_name: "Customer " + i,
      final_amount: 100 + i, amount_paid: 0,
      bill_items: [{ item_name: "Item " + i, quantity: 1, line_total: 100 + i }],
    }));
    const result = buildReportAnalytics(bills, bills.length, "2026-10-01", "2026-10-31");
    expect(result.top_customers).toHaveLength(8);
    expect(result.top_items).toHaveLength(8);
    expect(result.top_customers[0].name).toBe("Customer 11");
  });
});
