export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#f4f4f2" }}>
      {children}
    </div>
  );
}
