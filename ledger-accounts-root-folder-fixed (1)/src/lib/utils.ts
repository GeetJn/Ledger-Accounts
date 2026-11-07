import { parsePhoneNumberFromString } from "libphonenumber-js";
export function money(value: number | string | null | undefined, currency = "INR", locale = "en-IN") {
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value ?? 0));
}
export function dateTime(value: string, timeZone = "Asia/Kolkata") {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "medium", timeZone }).format(new Date(value));
}
export function toE164(value: string, defaultCountry = "IN") {
  const parsed = parsePhoneNumberFromString(value, defaultCountry as never);
  if (!parsed?.isValid()) throw new Error("Enter a valid international phone number, including the country code where needed.");
  return parsed.number;
}
export function calculateBill(lines: Array<{ quantity: number; rate: number; discount?: number }>, billDiscount = 0, taxRate = 0) {
  const subtotal = lines.reduce((sum, line) => sum + Math.max(0, line.quantity) * Math.max(0, line.rate), 0);
  const lineDiscount = lines.reduce((sum, line) => sum + Math.min(Math.max(0, line.discount ?? 0), Math.max(0, line.quantity) * Math.max(0, line.rate)), 0);
  const discount = Math.min(subtotal, lineDiscount + Math.max(0, billDiscount));
  const taxable = Math.max(0, subtotal - discount);
  const tax = taxable * Math.max(0, taxRate) / 100;
  return { subtotal: round2(subtotal), discount: round2(discount), tax: round2(tax), total: round2(taxable + tax) };
}
export function round2(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
