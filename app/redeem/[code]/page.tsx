import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RedeemClient from "./RedeemClient";

export default async function RedeemPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login`);
  }

  const { data: member } = await supabase
    .from("restaurant_members")
    .select("contract_end")
    .eq("profile_id", user.id)
    .limit(1)
    .single();

  const today = new Date().toISOString().slice(0, 10);
  const isDeactivated = !!(member?.contract_end && member.contract_end <= today);

  if (isDeactivated) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#f4f4f2",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 20,
            padding: "40px 32px",
            maxWidth: 380,
            width: "100%",
            boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#111827",
              marginBottom: 10,
            }}
          >
            Access denied
          </h1>
          <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.6 }}>
            Your account has been deactivated. Please contact your manager to
            redeem vouchers.
          </p>
        </div>
      </div>
    );
  }

  return <RedeemClient code={code.toUpperCase()} />;
}
