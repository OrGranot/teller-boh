export function formatEuro(value: number | null | undefined): string {
  if (value == null) return "-";
  const v = Math.round(value * 100) / 100;
  return v.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " €";
}

export function parseNum(s: string): number {
  if (!s) return 0;
  let str = s.replace(/€/g, "").trim();
  if (str.includes(",") && str.includes(".")) {
    if (str.lastIndexOf(",") > str.lastIndexOf(".")) {
      str = str.replace(/\./g, "").replace(",", ".");
    } else {
      str = str.replace(/,/g, "");
    }
  } else if (str.includes(",")) {
    str = str.replace(",", ".");
  }
  return parseFloat(str) || 0;
}

export const LABELS = {
  de: {
    title: "Rechnung",
    date: "Datum:",
    number: "Rechnungsnummer:",
    qty: "Menge",
    desc: "Bezeichnung",
    vat: "MwSt.",
    unit_price: "Einzelpreis",
    sum: "Gesamt",
    tip: "Trinkgeld",
    total: "Gesamtbetrag",
    due: "Zahlbar bis",
    draft_label: "Entwurf",
    sent_label: "Versendet",
    paid_label: "Bezahlt",
  },
  en: {
    title: "Invoice",
    date: "Date:",
    number: "Invoice number:",
    qty: "Quantity",
    desc: "Description",
    vat: "VAT",
    unit_price: "Price per unit",
    sum: "Sum",
    tip: "Tip",
    total: "Total",
    due: "Due date",
    draft_label: "Draft",
    sent_label: "Sent",
    paid_label: "Paid",
  },
} as const;

export type Lang = "de" | "en";
export type Labels = (typeof LABELS)[Lang];

export function today(): string {
  return new Date().toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function addDays(dateStr: string, days: number): string {
  const [d, m, y] = dateStr.split(".").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
