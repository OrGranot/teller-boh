export interface CompanySettings {
  id?: string;
  name: string;
  display_name?: string;
  address: string;
  phone?: string;
  vat?: string;
  tax?: string;
  iban?: string;
  bic?: string;
  email?: string;
  logo_url?: string;
  trade_register?: string;
}

export interface Contact {
  id: string;
  name: string;
  address?: string;
  email?: string;
  phone?: string;
  notes?: string;
  trade_register?: string;
  tax_number?: string;
  vat_number?: string;
  created_at?: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  description?: string;
  price?: number;
  vat_rate?: number;
  created_at?: string;
}

export interface InvoiceItem {
  id?: string;
  qty: string;
  description: string;
  price: string;
  vat_rate: string;
  sum?: string; // computed display only
}

export interface Invoice {
  id?: string;
  invoice_number?: string;
  date: string;
  due_date: string;
  customer_name: string;
  customer_address: string;
  customer_email?: string;
  customer_trade_register?: string;
  customer_tax_number?: string;
  customer_vat_number?: string;
  tip_percent: string;
  lang: "de" | "en";
  status?: "draft" | "sent" | "paid";
  total?: number;
  items: InvoiceItem[];
  notes?: string;
  created_at?: string;
}
