import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/shifts");

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#f4f4f2" }}>
      {children}
    </div>
  );
}
