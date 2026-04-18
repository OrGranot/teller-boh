import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1a1a1a",
    padding: 50,
    backgroundColor: "#ffffff",
  },
  border: {
    border: "2px solid #1a1a1a",
    borderRadius: 8,
    padding: 40,
    flex: 1,
  },
  header: { marginBottom: 28 },
  brand: { fontSize: 22, fontFamily: "Helvetica-Bold", letterSpacing: 3 },
  subtitle: { fontSize: 10, color: "#888", marginTop: 4, letterSpacing: 1 },
  divider: { borderBottomWidth: 1, borderBottomColor: "#ddd", marginVertical: 20 },
  label: { fontSize: 8, color: "#888", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 },
  value: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  amount: { fontSize: 36, fontFamily: "Helvetica-Bold", marginVertical: 16 },
  row: { flexDirection: "row", gap: 40, marginBottom: 16 },
  col: { flex: 1 },
  code: { fontSize: 16, fontFamily: "Helvetica-Bold", letterSpacing: 2, marginTop: 4 },
  message: { fontSize: 10, fontFamily: "Helvetica-Oblique", color: "#444", marginTop: 4, lineHeight: 1.5 },
  footer: { marginTop: 24, fontSize: 8, color: "#aaa" },
});

function formatEuro(amount: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount);
}

function formatDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("de-DE");
}

interface Voucher {
  voucher_code: string;
  amount: number;
  buyer_name?: string | null;
  recipient_name?: string | null;
  recipient_email?: string | null;
  personal_message?: string | null;
  valid_until?: string | null;
  purchased_at?: string | null;
}

interface Props {
  voucher: Voucher;
  companyName?: string;
}

export default function VoucherPDF({ voucher, companyName = "Teller" }: Props) {
  return (
    <Document>
      <Page size="A5" orientation="landscape" style={s.page}>
        <View style={s.border}>
          <View style={s.header}>
            <Text style={s.brand}>{companyName.toUpperCase()}</Text>
            <Text style={s.subtitle}>GIFT VOUCHER</Text>
          </View>

          <Text style={s.amount}>{formatEuro(voucher.amount)}</Text>

          <View style={s.divider} />

          <View style={s.row}>
            <View style={s.col}>
              <Text style={s.label}>Voucher code</Text>
              <Text style={s.code}>{voucher.voucher_code}</Text>
            </View>
            {voucher.valid_until && (
              <View style={s.col}>
                <Text style={s.label}>Valid until</Text>
                <Text style={s.value}>{formatDate(voucher.valid_until ?? null)}</Text>
              </View>
            )}
          </View>

          {(voucher.recipient_name || voucher.buyer_name) && (
            <View style={s.row}>
              {voucher.recipient_name && (
                <View style={s.col}>
                  <Text style={s.label}>For</Text>
                  <Text style={s.value}>{voucher.recipient_name}</Text>
                </View>
              )}
              {voucher.buyer_name && (
                <View style={s.col}>
                  <Text style={s.label}>From</Text>
                  <Text style={s.value}>{voucher.buyer_name}</Text>
                </View>
              )}
            </View>
          )}

          {voucher.personal_message && (
            <View>
              <Text style={s.label}>Message</Text>
              <Text style={s.message}>&ldquo;{voucher.personal_message}&rdquo;</Text>
            </View>
          )}

          <Text style={s.footer}>
            {voucher.purchased_at ? `Issued ${formatDate(voucher.purchased_at)}` : ""}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
