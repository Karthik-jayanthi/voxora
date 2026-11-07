"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  unit: string;
  stock_quantity: number;
  minimum_stock: number;
  aliases: string[];
};

type Form = {
  name: string;
  category: string;
  price: string;
  unit: string;
  stock_quantity: string;
  minimum_stock: string;
  aliases: string;
};

const UNITS = ["kg", "g", "litre", "ml", "packet", "piece"];
const BLANK: Form = { name: "", category: "General", price: "", unit: "kg", stock_quantity: "", minimum_stock: "5", aliases: "" };

const inputCls =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-emerald-700";

function isLow(p: Product) {
  return Number(p.stock_quantity) <= Number(p.minimum_stock);
}

function toForm(p: Product): Form {
  return {
    name: p.name,
    category: p.category,
    price: String(p.price),
    unit: p.unit,
    stock_quantity: String(p.stock_quantity),
    minimum_stock: String(p.minimum_stock),
    aliases: (p.aliases ?? []).join(", "),
  };
}

function parseAliases(text: string) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,\n]/)) {
    const a = raw.trim();
    const key = a.toLowerCase();
    if (a && !seen.has(key)) {
      seen.add(key);
      out.push(a);
    }
  }
  return out;
}

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [lowOnly, setLowOnly] = useState(false);

  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [form, setForm] = useState<Form>(BLANK);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<Product | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    const [prod, store] = await Promise.all([
      supabase.from("products").select("*").order("name"),
      supabase.from("stores").select("id").maybeSingle(),
    ]);
    if (prod.error || store.error) {
      setLoadError("Could not load your products. Check your connection and try again.");
    } else {
      setProducts((prod.data as Product[]) ?? []);
      setStoreId(store.data?.id ?? null);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const categories = useMemo(() => Array.from(new Set(products.map((p) => p.category))).sort(), [products]);
  const lowCount = useMemo(() => products.filter(isLow).length, [products]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (lowOnly && !isLow(p)) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || (p.aliases ?? []).some((a) => a.toLowerCase().includes(q));
    });
  }, [products, search, category, lowOnly]);

  function openNew() {
    setForm(BLANK);
    setFormError(null);
    setEditing("new");
  }

  function openEdit(p: Product) {
    setForm(toForm(p));
    setFormError(null);
    setEditing(p);
  }

  function setField(key: keyof Form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    const name = form.name.trim();
    const price = Number(form.price);
    const stock = Number(form.stock_quantity);
    const min = Number(form.minimum_stock);

    if (!name) return setFormError("Enter a product name.");
    if (form.price.trim() === "" || !Number.isFinite(price) || price < 0) return setFormError("Enter a valid price (0 or more).");
    if (form.stock_quantity.trim() === "" || !Number.isFinite(stock) || stock < 0) return setFormError("Enter a valid stock quantity (0 or more).");
    if (form.minimum_stock.trim() === "" || !Number.isFinite(min) || min < 0) return setFormError("Enter a valid minimum stock (0 or more).");
    if (price > 10000000 || stock > 10000000 || min > 10000000) return setFormError("One of the numbers is too large.");
    if (!form.unit) return setFormError("Choose a unit.");

    const row = {
      name,
      category: form.category.trim() || "General",
      price: Math.round(price * 100) / 100,
      unit: form.unit,
      stock_quantity: Math.round(stock * 100) / 100,
      minimum_stock: Math.round(min * 100) / 100,
      aliases: parseAliases(form.aliases),
    };

    setSaving(true);
    setFormError(null);
    let error;
    if (editing === "new") {
      if (!storeId) {
        setSaving(false);
        return setFormError("Your store could not be found. Refresh the page and try again.");
      }
      ({ error } = await supabase.from("products").insert({ ...row, store_id: storeId }));
    } else if (editing) {
      ({ error } = await supabase.from("products").update(row).eq("id", editing.id));
    }
    setSaving(false);

    if (error) {
      setFormError("Could not save the product. Try again.");
      return;
    }
    setEditing(null);
    load();
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const { error } = await supabase.from("products").delete().eq("id", deleting.id);
    setDeleteBusy(false);
    if (error) {
      setDeleteError("Could not delete the product. Try again.");
      return;
    }
    setDeleting(null);
    load();
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Inventory</h1>
          <p className="mt-1 text-sm text-neutral-600">{products.length} products</p>
        </div>
        <button
          onClick={openNew}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900"
        >
          <Plus size={16} /> Add product
        </button>
      </div>

      {lowCount > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <span className="inline-flex items-center gap-2">
            <AlertTriangle size={16} />
            {lowCount} {lowCount === 1 ? "product is" : "products are"} low on stock.
          </span>
          <button onClick={() => setLowOnly(!lowOnly)} className="font-medium underline">
            {lowOnly ? "Show all products" : "Show low stock only"}
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or alias"
            aria-label="Search products"
            className={`${inputCls} pl-9`}
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Filter by category"
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="mt-4 rounded-xl border border-neutral-200 bg-white">
        {loading && (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-neutral-500">
            <Loader2 size={16} className="animate-spin" /> Loading products...
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
            {products.length === 0 ? "No products yet. Add your first product." : "No products match your search."}
          </p>
        )}

        {!loading && !loadError && visible.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b border-neutral-200 text-xs uppercase text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 text-right font-medium">Price</th>
                  <th className="px-4 py-3 text-right font-medium">Stock</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => {
                  const low = isLow(p);
                  return (
                    <tr key={p.id} className={`border-b border-neutral-100 last:border-0 ${low ? "bg-amber-50/50" : ""}`}>
                      <td className="px-4 py-3 font-medium text-neutral-900">{p.name}</td>
                      <td className="px-4 py-3 text-neutral-600">{p.category}</td>
                      <td className="px-4 py-3 text-right text-neutral-900">₹{Number(p.price).toFixed(2)}/{p.unit}</td>
                      <td className="px-4 py-3 text-right text-neutral-900">{Number(p.stock_quantity)} {p.unit}</td>
                      <td className="px-4 py-3">
                        {low ? (
                          <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                            Low stock (min {Number(p.minimum_stock)})
                          </span>
                        ) : (
                          <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">In stock</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => openEdit(p)}
                            aria-label={`Edit ${p.name}`}
                            className="rounded p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => { setDeleteError(null); setDeleting(p); }}
                            aria-label={`Delete ${p.name}`}
                            className="rounded p-1.5 text-neutral-500 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Product form">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900">{editing === "new" ? "Add product" : "Edit product"}</h2>
              <button onClick={() => setEditing(null)} aria-label="Close" className="rounded p-1 text-neutral-500 hover:bg-neutral-100">
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="f-name" className="mb-1 block text-sm font-medium text-neutral-700">Name</label>
                <input id="f-name" value={form.name} onChange={(e) => setField("name", e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="f-cat" className="mb-1 block text-sm font-medium text-neutral-700">Category</label>
                <input id="f-cat" value={form.category} onChange={(e) => setField("category", e.target.value)} list="cat-list" className={inputCls} />
                <datalist id="cat-list">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div>
                <label htmlFor="f-unit" className="mb-1 block text-sm font-medium text-neutral-700">Unit</label>
                <select id="f-unit" value={form.unit} onChange={(e) => setField("unit", e.target.value)} className={inputCls}>
                  {UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="f-price" className="mb-1 block text-sm font-medium text-neutral-700">Price (₹ per unit)</label>
                <input id="f-price" inputMode="decimal" value={form.price} onChange={(e) => setField("price", e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="f-stock" className="mb-1 block text-sm font-medium text-neutral-700">Available stock</label>
                <input id="f-stock" inputMode="decimal" value={form.stock_quantity} onChange={(e) => setField("stock_quantity", e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="f-min" className="mb-1 block text-sm font-medium text-neutral-700">Low-stock alert at</label>
                <input id="f-min" inputMode="decimal" value={form.minimum_stock} onChange={(e) => setField("minimum_stock", e.target.value)} className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="f-alias" className="mb-1 block text-sm font-medium text-neutral-700">Other names customers use (aliases)</label>
                <textarea
                  id="f-alias"
                  rows={3}
                  value={form.aliases}
                  onChange={(e) => setField("aliases", e.target.value)}
                  className={inputCls}
                />
                <p className="mt-1 text-xs text-neutral-500">
                  Separate with commas, in English, Telugu or Kannada. If a voice order misses this product, add the word it heard here. Two products sharing one alias will ask you to choose.
                </p>
              </div>
            </div>

            {formError && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formError}</p>}

            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50">
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-60"
              >
                {saving && <Loader2 size={16} className="animate-spin" />}
                {saving ? "Saving..." : "Save product"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="alertdialog" aria-modal="true" aria-label="Delete product">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-neutral-900">Delete {deleting.name}?</h2>
            <p className="mt-2 text-sm text-neutral-600">
              The product is removed from your inventory. Past orders keep its name and price.
            </p>
            {deleteError && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{deleteError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setDeleting(null)} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50">
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleteBusy}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deleteBusy && <Loader2 size={16} className="animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}