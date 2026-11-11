"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase";

const inputCls =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-emerald-700";

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [storeName, setStoreName] = useState("");
  const [address, setAddress] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError(null);
    const [store, session] = await Promise.all([
      supabase.from("stores").select("id,store_name,address").maybeSingle(),
      supabase.auth.getSession(),
    ]);
    if (store.error || !store.data) {
      setLoadError("Could not load your store settings. Check your connection and try again.");
    } else {
      setStoreId(store.data.id);
      setStoreName(store.data.store_name ?? "");
      setAddress(store.data.address ?? "");
      setEmail(session.data.session?.user.email ?? "");
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    const name = storeName.trim();
    const addr = address.trim();
    setSaved(false);
    if (!name) return setSaveError("Enter a store name.");
    if (name.length > 80) return setSaveError("The store name is too long (80 characters at most).");
    if (addr.length > 200) return setSaveError("The address is too long (200 characters at most).");
    if (!storeId) return setSaveError("Your store could not be found. Refresh the page and try again.");

    setSaving(true);
    setSaveError(null);
    const { error } = await supabase
      .from("stores")
      .update({ store_name: name, address: addr || null })
      .eq("id", storeId);
    setSaving(false);

    if (error) {
      setSaveError("Could not save your settings. Try again.");
      return;
    }
    setSaved(true);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-neutral-500">
        <Loader2 size={16} className="animate-spin" /> Loading settings...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="text-sm text-red-700">
        <p>{loadError}</p>
        <button onClick={load} className="mt-2 font-medium underline">Try again</button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold text-neutral-900">Settings</h1>

      <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-neutral-900">Store</h2>

        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="s-name" className="mb-1 block text-sm font-medium text-neutral-700">Store name</label>
            <input id="s-name" value={storeName} onChange={(e) => { setStoreName(e.target.value); setSaved(false); }} className={inputCls} />
          </div>
          <div>
            <label htmlFor="s-addr" className="mb-1 block text-sm font-medium text-neutral-700">Address (optional)</label>
            <textarea id="s-addr" rows={3} value={address} onChange={(e) => { setAddress(e.target.value); setSaved(false); }} className={inputCls} />
          </div>
        </div>

        {saveError && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{saveError}</p>}
        {saved && (
          <p className="mt-4 inline-flex items-center gap-2 text-sm text-emerald-800">
            <CheckCircle2 size={16} /> Saved. Refresh the page to see the new name in the sidebar.
          </p>
        )}

        <div className="mt-5">
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-60"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-neutral-900">Account</h2>
        <p className="mt-2 text-sm text-neutral-600">Signed in as <span className="font-medium text-neutral-900">{email}</span></p>
        <button
          onClick={logout}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
        >
          <LogOut size={16} /> Log out
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-neutral-900">Voice ordering tips</h2>
        <p className="mt-2 text-sm text-neutral-600">
          If a voice order misses a product, open Inventory, edit that product, and add the word that was heard to its aliases.
        </p>
      </div>
    </div>
  );
}