"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface Voucher {
  id: string;
  voucher_code: string;
  amount: number;
  buyer_name: string;
  recipient_name: string;
  status: "active" | "redeemed" | "expired" | "cancelled";
  valid_until: string | null;
  purchased_at: string;
  redeemed_at: string | null;
}

function formatEuro(n: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("de-DE");
}

const STATUS_CONFIG = {
  active: { label: "Active", bg: "#d1fae5", color: "#065f46" },
  redeemed: { label: "Redeemed", bg: "#f3f4f6", color: "#6b7280" },
  expired: { label: "Expired", bg: "#fee2e2", color: "#991b1b" },
  cancelled: { label: "Cancelled", bg: "#fee2e2", color: "#9a3412" },
};

export default function RedeemPage() {
  const params = useParams();
  const code = (params.code as string).toUpperCase();

  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemed, setRedeemed] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/redeem/${code}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || data.error) setNotFound(true);
        else setVoucher(data);
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [code]);

  async function handleRedeem() {
    setRedeeming(true);
    setError("");
    const res = await fetch(`/api/redeem/${code}`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setRedeemed(true);
      setVoucher((v) => v ? { ...v, status: "redeemed", redeemed_at: new Date().toISOString() } : v);
    } else {
      setError(data.error || "Something went wrong.");
    }
    setRedeeming(false);
    setConfirming(false);
  }

  if (loading) {
    return (
      <div style={styles.page}>
        <p style={{ color: "#9ca3af", fontSize: 14 }}>Looking up voucher…</p>
      </div>
    );
  }

  if (notFound || !voucher) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
          <h1 style={styles.title}>Voucher not found</h1>
          <p style={{ color: "#6b7280", fontSize: 14 }}>Code: <code style={styles.mono}>{code}</code></p>
        </div>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[voucher.status];
  const isActive = voucher.status === "active";

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 13, color: "#9ca3af", letterSpacing: 2, marginBottom: 4 }}>TELLER BERLIN</div>
          <div style={{ fontSize: 13, color: "#9ca3af" }}>Gift Voucher</div>
        </div>

        {/* Amount */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 52, fontWeight: 700, color: "#3E1A28", lineHeight: 1 }}>
            {formatEuro(voucher.amount)}
          </div>
        </div>

        {/* Status badge */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <span style={{
            display: "inline-block",
            padding: "4px 16px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
            background: statusCfg.bg,
            color: statusCfg.color,
          }}>
            {redeemed ? "Redeemed" : statusCfg.label}
          </span>
        </div>

        {/* Details */}
        <div style={styles.details}>
          <div style={styles.row}>
            <span style={styles.label}>Code</span>
            <span style={styles.mono}>{voucher.voucher_code}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Recipient</span>
            <span>{voucher.recipient_name || "—"}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Buyer</span>
            <span>{voucher.buyer_name || "—"}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Valid until</span>
            <span>{formatDate(voucher.valid_until)}</span>
          </div>
          {(voucher.redeemed_at || redeemed) && (
            <div style={styles.row}>
              <span style={styles.label}>Redeemed on</span>
              <span>{formatDate(voucher.redeemed_at)}</span>
            </div>
          )}
        </div>

        {/* Redeem action */}
        {isActive && !redeemed && (
          <div style={{ marginTop: 28, textAlign: "center" }}>
            {!confirming ? (
              <button
                onClick={() => setConfirming(true)}
                style={styles.redeemBtn}
              >
                Mark as Redeemed
              </button>
            ) : (
              <div>
                <p style={{ color: "#374151", fontSize: 14, marginBottom: 14, fontWeight: 500 }}>
                  Confirm redemption of {formatEuro(voucher.amount)}?
                </p>
                <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                  <button
                    onClick={handleRedeem}
                    disabled={redeeming}
                    style={{ ...styles.redeemBtn, opacity: redeeming ? 0.6 : 1 }}
                  >
                    {redeeming ? "Redeeming…" : "Confirm"}
                  </button>
                  <button
                    onClick={() => setConfirming(false)}
                    style={styles.cancelBtn}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {error && <p style={{ color: "#dc2626", fontSize: 13, marginTop: 10 }}>{error}</p>}
          </div>
        )}

        {redeemed && (
          <div style={{ marginTop: 24, textAlign: "center", color: "#065f46", fontWeight: 600, fontSize: 15 }}>
            ✓ Voucher successfully redeemed
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f4f4f2",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    background: "#fff",
    borderRadius: 20,
    padding: "32px 28px",
    width: "100%",
    maxWidth: 380,
    boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: "#111827",
    marginBottom: 8,
  },
  mono: {
    fontFamily: "monospace",
    fontWeight: 600,
    color: "#374151",
  },
  details: {
    background: "#f9fafb",
    borderRadius: 12,
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    fontSize: 14,
    color: "#374151",
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    color: "#9ca3af",
    fontSize: 13,
  },
  redeemBtn: {
    background: "#3E1A28",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "12px 28px",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
  },
  cancelBtn: {
    background: "transparent",
    color: "#6b7280",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "12px 20px",
    fontSize: 15,
    cursor: "pointer",
  },
};
