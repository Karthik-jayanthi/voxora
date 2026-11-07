"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Printer, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

type OrderItem = {
  id: string;
  product_name_snapshot: string;
  quantity: number;
  unit: string;
  unit_price: number;
  subtotal: number;
};

type Order = {
  id: string;
  order_number: string;
  customer_name: string | null;
  subtotal: number;
  discount: number;
  total_amount: number;
  status: string;
  language: string | null;
  created_at: string;
  order_items: OrderItem[];
};

const RANGES = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
];

const inputCls =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-emerald-700";

const money = (n: number | string) => Number(n).toFixed(2);
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function inRange(iso: string, range: string) {
  if (range === "all") return true;
  const created = new Date(iso);
  const now = new Date();
  if (range === "today") return created.toDateString() === now.toDateString();
  const days = Number(range);
  return now.getTime() - created.getTime() <= days * 24 * 60 * 60 * 1000;
}

function invoiceHtml(order: Order, storeName: string) {
  const rows = order.order_items
    .map(
      (i) => `<tr>
        <td>${esc(i.product_name_snapshot)}</td>
        <td class="r">${Number(i.quantity)} ${esc(i.unit)}</td>
        <td class="r">₹${money(i.unit_price)}</td>
        <td class="r">₹${money(i.subtotal)}</td>
      </tr>`
    )
    .join("");
  const discountRow =
    Number(order.discount) > 0
      ? `<tr><td colspan="3" class="r">Discount</td><td class="r">- ₹${money(order.discount)}</td></tr>`
      : "";

  return `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${esc(order.order_number)}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;margin:32px;max-width:720px}
  h1{font-size:22px;margin:0}
  .muted{color:#6b7280;font-size:13px}
  table{width:100%;border-collapse:collapse;margin-top:24px;font-size:14px}
  th{text-align:left;border-bottom:2px solid #1f2937;padding:8px 4px;font-size:12px;text-transform:uppercase}
  td{padding:8px 4px;border-bottom:1px solid #e5e7eb}
  .r{text-align:right}
  .total td{font-weight:bold;font-size:16px;border-bottom:none;border-top:2px solid #1f2937}
  .foot{margin-top:32px;font-size:12px;color:#6b7280}
</style></head><body>
  <h1>${esc(storeName)}</h1>
  <p class="muted">Invoice ${esc(order.order_number)}<br>${esc(when(order.created_at))}${
    order.customer_name ? `<br>Customer: ${esc(order.customer_name)}` : ""
  }</p>
  <table>
    <thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead>
    <tbody>${rows}
      <tr><td colspan="3" class="r">Subtotal</td><td class="r">₹${money(order.subtotal)}</td></tr>
      ${discountRow}
      <tr class="total"><td colspan="3" class="r">Total</td><td class="r">₹${money(order.total_amount)}</td></tr>
    </tbody>
  </table>
  <p class="foot">Thank you for shopping with us.</p>
</body></html>`;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [storeName, setStoreName] = useState("Store");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [range, setRange] = useState("all");
  const [selected, setSelected] = useState<Order | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    const [ord, store] = await Promise.all([
      supabase
        .from("orders")
        .select("id,order_number,customer_name,subtotal,discount,total_amount,status,language,created_at,order_items(id,product_name_snapshot,quantity,unit,unit_price,subtotal)")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("stores").select("store_name").maybeSingle(),
    ]);
    if (ord.error) {
      setLoadError("Could not load your orders. Check your connection and try again.");
    } else {
      setOrders((ord.data as unknown as Order[]) ?? []);
      setStoreName(store.data?.store_name ?? "Store");
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (!inRange(o.created_at, range)) return false;
      if (!q) return true;
      return o.order_number.toLowerCase().includes(q) || (o.customer_name ?? "").toLowerCase().includes(q);
    });
  }, [orders, search, range]);

  function printInvoice(order: Order) {
    setPrintError(null);
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) {
      setPrintError("Your browser blocked the invoice window. Allow pop-ups for this site and try again.");
      return;
    }
    w.document.write(invoiceHtml(order, storeName));
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold text-neutral-900">Order History</h1>
      <p className="mt-1 text-sm text-neutral-600">Your most recent 200 orders.</p>

      <div className="mt-4 flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order number or customer"
            aria-label="Search orders"
            className={`${inputCls} pl-9`}
          />
        </div>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value)}
          aria-label="Filter by date"
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
        >
          {RANGES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>

      <div className="mt-4 rounded-xl border border-neutral-200 bg-white">
        {loading && (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-neutral-500">
            <Loader2 size={16} className="animate-spin" /> Loading orders...
          </div>
        )}

        {loadError && (
          <div className="p-6 text-sm text-red-700">
            <p>{loadError}</p>
            <button onClick={load} className="mt-2 font-medium underline">Try again</button>
          </div>
        )}

        {!loading && !loadError && visible.length === 0 && (
          <p className="p-10 text-center text-sm text-neutral-500">
            {orders.length === 0 ? "No orders yet. Confirm a voice order and it will appear here." : "No orders match your search."}
          </p>
        )}

        {!loading && !loadError && visible.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-neutral-200 text-xs uppercase text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Date and time</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 text-right font-medium">Items</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => setSelected(o)}
                    className="cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-neutral-50"
                  >
                    <td className="px-4 py-3 font-medium text-emerald-900">
                      <button onClick={() => setSelected(o)} className="underline-offset-2 hover:underline">{o.order_number}</button>
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{when(o.created_at)}</td>
                    <td className="px-4 py-3 text-neutral-600">{o.customer_name || "-"}</td>
                    <td className="px-4 py-3 text-right text-neutral-900">{o.order_items.length}</td>
                    <td className="px-4 py-3 text-right font-medium text-neutral-900">₹{money(o.total_amount)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          o.status === "confirmed" ? "bg-emerald-50 text-emerald-800" : "bg-neutral-100 text-neutral-700"
                        }`}
                      >
                        {o.status === "confirmed" ? "Confirmed" : "Cancelled"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Order details">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-lg">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-neutral-900">{selected.order_number}</h2>
                <p className="text-sm text-neutral-600">
                  {when(selected.created_at)}
                  {selected.customer_name ? ` · ${selected.customer_name}` : ""}
                </p>
              </div>
              <button onClick={() => { setSelected(null); setPrintError(null); }} aria-label="Close" className="rounded p-1 text-neutral-500 hover:bg-neutral-100">
                <X size={18} />
              </button>
            </div>

            <table className="mt-4 w-full text-left text-sm">
              <thead className="border-b border-neutral-200 text-xs uppercase text-neutral-500">
                <tr>
                  <th className="py-2 font-medium">Item</th>
                  <th className="py-2 text-right font-medium">Qty</th>
                  <th className="py-2 text-right font-medium">Price</th>
                  <th className="py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {selected.order_items.map((i) => (
                  <tr key={i.id} className="border-b border-neutral-100">
                    <td className="py-2 text-neutral-900">{i.product_name_snapshot}</td>
                    <td className="py-2 text-right text-neutral-700">{Number(i.quantity)} {i.unit}</td>
                    <td className="py-2 text-right text-neutral-700">₹{money(i.unit_price)}</td>
                    <td className="py-2 text-right text-neutral-900">₹{money(i.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between text-neutral-600">
                <span>Subtotal</span><span>₹{money(selected.subtotal)}</span>
              </div>
              {Number(selected.discount) > 0 && (
                <div className="flex justify-between text-neutral-600">
                  <span>Discount</span><span>- ₹{money(selected.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-semibold text-neutral-900">
                <span>Total</span><span>₹{money(selected.total_amount)}</span>
              </div>
            </div>

            {printError && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{printError}</p>}

            <button
              onClick={() => printInvoice(selected)}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-800 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-50"
            >
              <Printer size={16} /> Print invoice
            </button>
          </div>
        </div>
      )}
    </div>
  );
}