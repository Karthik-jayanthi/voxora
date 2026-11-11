"use client";

import { useEffect, useMemo, useState } from "react";
import { IndianRupee, Loader2, ShoppingBag, TrendingUp } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Line = { product_name_snapshot: string; quantity: number; unit: string; subtotal: number };
type OrderRow = { id: string; total_amount: number; created_at: string; order_items: Line[] };

const FETCH_LIMIT = 1000;

const cents = (n: number | string) => Math.round(Number(n) * 100);
const rupees = (c: number) => (c / 100).toFixed(2);
const dayKey = (d: Date) => d.toLocaleDateString("en-CA"); // YYYY-MM-DD in local time

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="flex items-center justify-between text-neutral-500">
        <span className="text-sm">{label}</span>
        {icon}
      </div>
      <p className="mt-2 text-2xl font-semibold text-neutral-900">{value}</p>
    </div>
  );
}

export default function AnalyticsPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<7 | 30>(7);

  async function load() {
    setLoading(true);
    setError(null);

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 29);

    const [recent, count] = await Promise.all([
      supabase
        .from("orders")
        .select("id,total_amount,created_at,order_items(product_name_snapshot,quantity,unit,subtotal)")
        .eq("status", "confirmed")
        .gte("created_at", start.toISOString())
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "confirmed"),
    ]);

    if (recent.error || count.error) {
      setError("Could not load analytics. Check your connection and try again.");
    } else {
      setOrders((recent.data as unknown as OrderRow[]) ?? []);
      setTotalOrders(count.count ?? 0);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const today = dayKey(new Date());
    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - 6);

    let todayC = 0;
    let weekC = 0;
    let monthC = 0;
    for (const o of orders) {
      const c = cents(o.total_amount);
      const d = new Date(o.created_at);
      monthC += c;
      if (d >= weekStart) weekC += c;
      if (dayKey(d) === today) todayC += c;
    }
    return { todayC, weekC, monthC };
  }, [orders]);

  const days = useMemo(() => {
    return Array.from({ length: range }, (_, i) => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - (range - 1 - i));
      const key = dayKey(d);
      const total = orders
        .filter((o) => dayKey(new Date(o.created_at)) === key)
        .reduce((sum, o) => sum + cents(o.total_amount), 0);
      const label = range === 7 ? d.toLocaleDateString("en-IN", { weekday: "short" }) : String(d.getDate());
      return { key, label, total };
    });
  }, [orders, range]);

  const rangeTotalC = days.reduce((s, d) => s + d.total, 0);
  const maxDay = Math.max(1, ...days.map((d) => d.total));

  const best = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (range - 1));

    const map = new Map<string, { name: string; unit: string; qty: number; revenueC: number }>();
    for (const o of orders) {
      if (new Date(o.created_at) < start) continue;
      for (const it of o.order_items) {
        const key = `${it.product_name_snapshot}|${it.unit}`;
        const cur = map.get(key) ?? { name: it.product_name_snapshot, unit: it.unit, qty: 0, revenueC: 0 };
        cur.qty = Math.round((cur.qty + Number(it.quantity)) * 100) / 100;
        cur.revenueC += cents(it.subtotal);
        map.set(key, cur);
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.revenueC - a.revenueC)
      .slice(0, 5);
  }, [orders, range]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-neutral-500">
        <Loader2 size={16} className="animate-spin" /> Loading analytics...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-700">
        <p>{error}</p>
        <button onClick={load} className="mt-2 font-medium underline">Try again</button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold text-neutral-900">Analytics</h1>
      <p className="mt-1 text-sm text-neutral-600">Based on your confirmed orders.</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Revenue today" value={`₹${rupees(stats.todayC)}`} icon={<IndianRupee size={18} />} />
        <StatCard label="Last 7 days" value={`₹${rupees(stats.weekC)}`} icon={<TrendingUp size={18} />} />
        <StatCard label="Last 30 days" value={`₹${rupees(stats.monthC)}`} icon={<TrendingUp size={18} />} />
        <StatCard label="Total orders (all time)" value={String(totalOrders)} icon={<ShoppingBag size={18} />} />
      </div>

      {orders.length >= FETCH_LIMIT && (
        <p className="mt-3 text-xs text-amber-800">Showing the latest {FETCH_LIMIT} orders from the last 30 days, so these figures may be lower than the real totals.</p>
      )}

      <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">Daily revenue</h2>
            <p className="text-xs text-neutral-500">₹{rupees(rangeTotalC)} in the last {range} days</p>
          </div>
          <div className="inline-flex rounded-lg border border-neutral-300 p-0.5" role="group" aria-label="Date range">
            {([7, 30] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                aria-pressed={range === r}
                className={`rounded-md px-3 py-1 text-sm ${range === r ? "bg-emerald-800 text-white" : "text-neutral-700 hover:bg-neutral-100"}`}
              >
                {r} days
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex h-44 items-end gap-1">
          {days.map((d) => (
            <div key={d.key} className="flex flex-1 flex-col items-center justify-end gap-1">
              {range === 7 && (
                <span className="text-[11px] text-neutral-500">{d.total > 0 ? `₹${Math.round(d.total / 100)}` : ""}</span>
              )}
              <div
                className="w-full rounded-t bg-emerald-700"
                style={{ height: `${Math.max(d.total > 0 ? 6 : 2, (d.total / maxDay) * 120)}px`, opacity: d.total > 0 ? 1 : 0.25 }}
                title={`${d.key}: ₹${rupees(d.total)}`}
              />
              <span className="text-[11px] text-neutral-600">{d.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-neutral-900">Best-selling products (last {range} days)</h2>
        {best.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">No sales in this period yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="text-xs uppercase text-neutral-500">
                <tr>
                  <th className="py-2 font-medium">#</th>
                  <th className="py-2 font-medium">Product</th>
                  <th className="py-2 text-right font-medium">Sold</th>
                  <th className="py-2 text-right font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {best.map((b, i) => (
                  <tr key={`${b.name}|${b.unit}`} className="border-t border-neutral-100">
                    <td className="py-2 text-neutral-500">{i + 1}</td>
                    <td className="py-2 font-medium text-neutral-900">{b.name}</td>
                    <td className="py-2 text-right text-neutral-700">{b.qty} {b.unit}</td>
                    <td className="py-2 text-right font-medium text-neutral-900">₹{rupees(b.revenueC)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}