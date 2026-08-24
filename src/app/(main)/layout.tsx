import { Header } from "@/components/layout/Header";
import { MobileNav } from "@/components/layout/MobileNav";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col app-bg">
      <Header />
      <main className="flex-1 pb-28 md:pb-0">{children}</main>
      <MobileNav />
    </div>
  );
}
