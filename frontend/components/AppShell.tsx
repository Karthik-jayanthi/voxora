"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, ClipboardList, LayoutDashboard, LogOut, Mic, Package, Settings } from "lucide-react";
import { supabase } from "@/lib/supabase";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/voice-orders", label: "Voice Orders", icon: Mic },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/orders", label: "Order History", icon: ClipboardList },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [storeName, setStoreName] = useState("");

  useEffect(() => {
    let active = true;
    async function check() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/login");
        return;
      }
            let { data: store } = await supabase.from("stores").select("store_name").maybeSingle();
      if (!store) {
        await supabase.rpc("create_store", { p_name: "My Store" });
        const retry = await supabase.from("stores").select("store_name").maybeSingle();
        store = retry.data;
      }
      if (!active) return;
      setEmail(data.session.user.email ?? "");
      setStoreName(store?.store_name ?? "My Store");
      setReady(true);
    }
    check();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace("/login");
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (!ready) {
    return <div className="min-h-screen bg-neutral-50 flex items-center justify-center text-sm text-neutral-500">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-neutral-50 md:flex">
      <aside className="hidden md:flex md:w-60 md:flex-col border-r border-neutral-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-6">
          <div className="rounded-lg bg-emerald-800 p-1.5 text-white"><Mic size={18} /></div>
          <span className="text-lg font-semibold tracking-wide text-neutral-900">VOXORA</span>
        </div>
        <nav className="flex-1 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                  active ? "bg-emerald-50 font-medium text-emerald-900" : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-neutral-200 pt-3">
          <p className="truncate text-sm font-medium text-neutral-900">{storeName}</p>
          <p className="truncate text-xs text-neutral-500">{email}</p>
          <button onClick={logout} className="mt-3 flex items-center gap-2 text-sm text-neutral-600 hover:text-red-600">
            <LogOut size={16} /> Log out
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="md:hidden border-b border-neutral-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-neutral-900">VOXORA</span>
            <button onClick={logout} className="text-neutral-600" aria-label="Log out"><LogOut size={18} /></button>
          </div>
          <nav className="mt-2 flex gap-2 overflow-x-auto">
            {NAV.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`whitespace-nowrap rounded-full px-3 py-1 text-xs ${
                  pathname.startsWith(href) ? "bg-emerald-800 text-white" : "bg-neutral-100 text-neutral-700"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}