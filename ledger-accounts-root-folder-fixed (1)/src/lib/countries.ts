import { getCountries, getCountryCallingCode, type CountryCode } from "libphonenumber-js";
import metadata from "./countries-data.json";
const names = new Intl.DisplayNames(["en"], { type: "region" });
function flag(code: string) { return [...code].map(char => String.fromCodePoint(char.charCodeAt(0) + 127397)).join(""); }
export const countries = getCountries().map((code: CountryCode) => {
  const record = metadata[code as keyof typeof metadata];
  return {
    code,
    name: record?.name || names.of(code) || code,
    dial: `+${getCountryCallingCode(code)}`,
    currency: record?.currency || "",
    locale: record?.locale || `en-${code}`,
    timezone: record?.timezone || "Etc/UTC",
    flag: flag(code),
  };
}).sort((a,b)=>a.name.localeCompare(b.name));
