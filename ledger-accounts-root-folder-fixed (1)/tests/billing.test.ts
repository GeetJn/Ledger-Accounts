import { describe, expect, it } from "vitest";
import { calculateBill, round2 } from "../src/lib/utils";

describe("billing arithmetic", () => {
  it("calculates item subtotal, discounts and tax", () => {
    expect(calculateBill([
      { quantity: 2, rate: 500, discount: 0 },
      { quantity: 3, rate: 100, discount: 10 },
    ], 50, 18)).toEqual({ subtotal: 1300, discount: 60, tax: 223.2, total: 1463.2 });
  });
  it("caps discount at subtotal and prevents negative totals", () => {
    expect(calculateBill([{ quantity: 1, rate: 100, discount: 140 }], 30, 5)).toEqual({ subtotal: 100, discount: 100, tax: 0, total: 0 });
  });
  it("caps each item discount at that line amount before applying bill discounts", () => {
    expect(calculateBill([
      { quantity: 1, rate: 100, discount: 150 },
      { quantity: 1, rate: 100, discount: 0 },
    ])).toEqual({ subtotal: 200, discount: 100, tax: 0, total: 100 });
  });
  it("rounds financial values to two decimals", () => {
    expect(round2(10.005)).toBe(10.01);
  });
});
