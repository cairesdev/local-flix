export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen flex items-center justify-center bg-[var(--bg-primary)] p-4 overflow-hidden">
      {/* Glow de fundo sutil - identidade visual consistente com o resto do app */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(circle at 50% 0%, var(--accent-glow), transparent 55%)',
        }}
      />
      <div className="relative w-full max-w-md">{children}</div>
    </div>
  );
}
