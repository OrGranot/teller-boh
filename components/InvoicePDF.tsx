import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import { LABELS, formatEuro, parseNum } from "@/lib/format";
import type { Invoice, CompanySettings } from "@/lib/types";

const PAGE_H = 841.89;
const PAGE_W = 595.28;
const MARGIN = 50;

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1a1a1a",
    paddingHorizontal: MARGIN,
    paddingVertical: MARGIN,
  },
  // Header
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  headerLeft: { flexDirection: "column", gap: 6 },
  logo: { height: 68, maxWidth: 220, objectFit: "contain" },
  title: { fontSize: 22, fontFamily: "Helvetica-Bold" },
  headerRight: { textAlign: "right", gap: 4 },
  headerRightText: { fontSize: 10, textAlign: "right" },
  // Divider
  divider: { borderBottomWidth: 1, borderBottomColor: "#555", marginVertical: 14 },
  thinDivider: { borderBottomWidth: 0.5, borderBottomColor: "#aaa", marginVertical: 14 },
  // Two-column
  twoCol: { flexDirection: "row", gap: 20 },
  leftCol: { flex: 1 },
  rightCol: { flex: 1 },
  customerName: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 5 },
  addressLine: { fontSize: 10, marginBottom: 2 },
  companyName: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  displayName: { fontSize: 9, fontFamily: "Helvetica-Oblique", color: "#666", marginBottom: 3 },
  companyLine: { fontSize: 9.5, marginBottom: 2 },
  // Table
  table: { marginTop: 0 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f0f0f0",
    paddingVertical: 7,
    paddingHorizontal: 5,
    borderWidth: 0.5,
    borderColor: "#999",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 5,
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    borderBottomWidth: 0.3,
    borderColor: "#ccc",
  },
  tableLastRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 5,
    borderWidth: 0.5,
    borderColor: "#999",
  },
  headerCell: { fontSize: 9.5, fontFamily: "Helvetica-Bold" },
  cell: { fontSize: 9.5 },
  tipCell: { fontSize: 9.5, fontFamily: "Helvetica-Oblique", color: "#444" },
  colQty: { width: 52, textAlign: "center" },
  colDesc: { flex: 1 },
  colVat: { width: 70, textAlign: "right" },
  colPrice: { width: 90, textAlign: "right" },
  colSum: { width: 90, textAlign: "right" },
  // Total
  totalRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 12 },
  totalText: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  // Due date
  dueRow: { marginTop: 10 },
  dueText: { fontSize: 10 },
  // Footer
  footer: {
    position: "absolute",
    bottom: 20,
    left: MARGIN,
    right: MARGIN,
  },
  footerLine: { borderBottomWidth: 0.5, borderBottomColor: "#aaa", marginBottom: 5 },
  footerText: { fontSize: 7.5, color: "#666", textAlign: "center" },
});

interface Props {
  invoice: Invoice;
  company: CompanySettings;
  logoBase64?: string; // base64 data URL
}

export default function InvoicePDF({ invoice, company, logoBase64 }: Props) {
  const L = LABELS[invoice.lang || "de"];

  // Calculate items — price is NET unit price, sum is GROSS total
  let subtotal = 0;
  const rows = invoice.items.map((item) => {
    const qty = parseNum(item.qty);
    const netPrice = parseNum(item.price);
    const vatRate = parseNum(item.vat_rate);
    const manualSum = parseNum(item.sum || "");
    // Gross total: use manual sum if set, else compute from net price
    const rowSum = manualSum > 0 ? manualSum : qty * netPrice * (1 + vatRate / 100);
    const vatAmt = vatRate > 0 ? rowSum * vatRate / (100 + vatRate) : 0;
    subtotal += rowSum;
    return { ...item, rowSum, vatAmt };
  });

  const tipPct = parseNum(invoice.tip_percent || "0");
  const tipAmount = tipPct > 0 ? Math.round(subtotal * tipPct) / 100 : 0;
  const total = subtotal + tipAmount;

  const isLastItemRow = (idx: number) => idx === rows.length - 1 && tipPct === 0;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* ── Header ── */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            {logoBase64 && (
              <Image src={logoBase64} style={s.logo} />
            )}
            <Text style={s.title}>{L.title}</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.headerRightText}>{L.date} {invoice.date}</Text>
            <Text style={[s.headerRightText, { marginTop: 4 }]}>{L.number} {invoice.invoice_number}</Text>
          </View>
        </View>

        {/* Divider */}
        <View style={s.divider} />

        {/* ── Two-column block ── */}
        <View style={s.twoCol}>
          {/* Customer */}
          <View style={s.leftCol}>
            <Text style={s.customerName}>{invoice.customer_name}</Text>
            {(invoice.customer_address || "").split("\n").filter(Boolean).map((line, i) => (
              <Text key={i} style={s.addressLine}>{line.trim()}</Text>
            ))}
            {(invoice.customer_trade_register || invoice.customer_tax_number || invoice.customer_vat_number) && (
              <Text style={[s.addressLine, { marginTop: 4, fontSize: 8.5, color: "#555" }]}>
                {invoice.customer_trade_register ? `Handelsregister: ${invoice.customer_trade_register}` : ""}
                {invoice.customer_tax_number ? `${invoice.customer_trade_register ? "  ·  " : ""}St.-Nr.: ${invoice.customer_tax_number}` : ""}
                {invoice.customer_vat_number ? `${(invoice.customer_trade_register || invoice.customer_tax_number) ? "  ·  " : ""}USt-IdNr.: ${invoice.customer_vat_number}` : ""}
              </Text>
            )}
          </View>

          {/* Company */}
          <View style={s.rightCol}>
            <Text style={s.companyName}>{company.name}</Text>
            {company.display_name && company.display_name !== company.name && (
              <Text style={s.displayName}>{company.display_name}</Text>
            )}
            <Text style={s.companyLine}>{company.address}</Text>
            {company.phone && <Text style={s.companyLine}>Phone: {company.phone}</Text>}
            {company.vat && <Text style={s.companyLine}>VAT: {company.vat}</Text>}
            {company.tax && <Text style={s.companyLine}>TAX: {company.tax}</Text>}
            {company.iban && <Text style={s.companyLine}>IBAN: {company.iban}</Text>}
            {company.email && <Text style={s.companyLine}>Email: {company.email}</Text>}
          </View>
        </View>

        <View style={s.thinDivider} />

        {/* ── Items Table ── */}
        <View style={s.table}>
          {/* Header row */}
          <View style={s.tableHeader}>
            <Text style={[s.headerCell, s.colQty]}>{L.qty}</Text>
            <Text style={[s.headerCell, s.colDesc]}>{L.desc}</Text>
            <Text style={[s.headerCell, s.colVat]}>{L.vat}</Text>
            <Text style={[s.headerCell, s.colPrice]}>{L.unit_price}</Text>
            <Text style={[s.headerCell, s.colSum]}>{L.sum}</Text>
          </View>

          {/* Item rows */}
          {rows.map((item, idx) => (
            <View
              key={idx}
              style={isLastItemRow(idx) ? s.tableLastRow : s.tableRow}
            >
              <Text style={[s.cell, s.colQty]}>{item.qty}</Text>
              <Text style={[s.cell, s.colDesc]}>{item.description}</Text>
              <Text style={[s.cell, s.colVat]}>{item.vatAmt > 0 ? `${parseNum(item.vat_rate)}%  ${formatEuro(item.vatAmt)}` : "-"}</Text>
              <Text style={[s.cell, s.colPrice]}>{parseNum(item.price) > 0 ? formatEuro(parseNum(item.price)) : "-"}</Text>
              <Text style={[s.cell, s.colSum]}>{formatEuro(item.rowSum)}</Text>
            </View>
          ))}

          {/* Tip row */}
          {tipPct > 0 && (
            <View style={s.tableLastRow}>
              <Text style={[s.tipCell, s.colQty]}></Text>
              <Text style={[s.tipCell, s.colDesc]}>
                {L.tip} {Number.isInteger(tipPct) ? tipPct : tipPct}%
              </Text>
              <Text style={[s.tipCell, s.colVat]}>-</Text>
              <Text style={[s.tipCell, s.colPrice]}>-</Text>
              <Text style={[s.tipCell, s.colSum]}>{formatEuro(tipAmount)}</Text>
            </View>
          )}
        </View>

        {/* ── Total ── */}
        <View style={s.totalRow}>
          <Text style={s.totalText}>{L.total}:  {formatEuro(total)}</Text>
        </View>

        {/* ── Due Date ── */}
        <View style={s.dueRow}>
          <Text style={s.dueText}>{L.due}  {invoice.due_date}</Text>
        </View>

        {/* ── Footer ── */}
        <View style={s.footer}>
          <View style={s.footerLine} />
          <Text style={s.footerText}>
            {company.name}
            {company.iban ? `  ·  IBAN: ${company.iban}` : ""}
            {company.bic ? `  ·  BIC: ${company.bic}` : ""}
          </Text>
          {(company.trade_register || company.tax || company.vat) && (
            <Text style={[s.footerText, { marginTop: 2 }]}>
              {company.trade_register ? `Handelsregister: ${company.trade_register}` : ""}
              {company.tax ? `${company.trade_register ? "  ·  " : ""}St.-Nr.: ${company.tax}` : ""}
              {company.vat ? `${(company.trade_register || company.tax) ? "  ·  " : ""}USt-IdNr.: ${company.vat}` : ""}
            </Text>
          )}
        </View>
      </Page>
    </Document>
  );
}
