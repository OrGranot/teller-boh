export interface Profile {
  id: string;
  name: string | null;
  created_at: string;
}

export interface Restaurant {
  id: string;
  name: string;
  created_at: string;
}

export interface Permissions {
  // Labor
  can_invite?: boolean;
  can_approve_invitations?: boolean;
  can_approve_shifts?: boolean;
  can_edit_shifts?: boolean;
  can_view_all_shifts?: boolean;
  can_manage_departments?: boolean;
  can_manage_roles?: boolean;
  // Finance
  can_manage_invoices?: boolean;
  can_manage_bewirtungsbeleg?: boolean;
  can_manage_vouchers?: boolean;
}

export interface Role {
  id: string;
  restaurant_id: string;
  name: string;
  is_owner: boolean;
  permissions: Permissions;
  created_at: string;
}

export interface RestaurantMember {
  id: string;
  restaurant_id: string;
  profile_id: string;
  role_id: string;
  salary: number | null;
  hours_per_week: number | null;
  contract_start: string | null;
  contract_end: string | null;
  created_at: string;
  // joined
  profile?: Profile;
  role?: Role;
}

export interface Department {
  id: string;
  restaurant_id: string;
  name: string;
  created_at: string;
}

export interface DepartmentMember {
  id: string;
  department_id: string;
  profile_id: string;
  is_manager: boolean;
  created_at: string;
}

export interface Invitation {
  id: string;
  restaurant_id: string;
  invited_by: string;
  department_id: string | null;
  role_id: string | null;
  email: string;
  name: string | null;
  salary: number | null;
  hours_per_week: number | null;
  contract_start: string | null;
  status: "pending_approval" | "approved" | "sent" | "accepted";
  token: string;
  expires_at: string;
  created_at: string;
  // joined
  department?: Department;
  role?: Role;
  invited_by_profile?: Profile;
}

export interface TimeRecord {
  id: string;
  profile_id: string;
  restaurant_id: string;
  department_id: string | null;
  clocked_in_at: string;
  clocked_out_at: string | null;
  status: "active" | "pending" | "approved" | "rejected";
  edited_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
  // joined
  profile?: Profile;
  department?: Department;
}

// Context stored in localStorage + derived on each load
export interface AppContext {
  restaurantId: string;
  restaurantName: string;
  memberId: string;
  role: Role;
  profileId: string;
  profileName: string | null;
  isDeactivated: boolean;
}

// ─── Finance types (from TellerBOH) ─────────────────────────────────────────

export interface CompanySettings {
  id?: string;
  restaurant_id?: string;
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
  restaurant_id?: string;
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
  restaurant_id?: string;
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
  sum?: string; // gross override
}

export interface Invoice {
  id?: string;
  restaurant_id?: string;
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
  tip_amount?: string;
  lang: "de" | "en";
  status?: "draft" | "sent" | "paid";
  total?: number;
  items: InvoiceItem[];
  notes?: string;
  created_at?: string;
}
