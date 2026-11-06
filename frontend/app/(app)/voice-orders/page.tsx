"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Mic, Plus, RotateCcw, Square, Trash2 } from "lucide-react";
import ConfirmOrder, { type ConfirmedOrder } from "@/components/ConfirmOrder";
import SpokenConfirmation from "@/components/SpokenConfirmation";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { blobToWav16k } from "@/lib/wav";

type Status = "idle" | "recording" | "processing" | "done" | "error";

type Item = {
  heard: string;
  product_id: string | null;
  candidate_ids: string[];
  candidates: { id: string; name: string }[];
  product_name: string | null;
  quantity: string | null;
  unit: string | null;
  unit_price: string | null;
  available: string | null;
  line_total: string | null;
  status: string;
  message: string | null;
};

type Product = { id: string; name: string; unit: string };

const MAX_SECONDS = 28; // Gnani accepts up to 30 seconds
const LANGS = [
  { value: "auto", label: "Auto-detect" },
  { value: "en", label: "English" },
  { value: "te", label: "Telugu" },
  { value: "kn", label: "Kannada" },
];

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  ok: { label: "OK", cls: "bg-emerald-50 text-emerald-800" },
  not_found: { label: "Not found", cls: "bg-red-50 text-red-700" },
  ambiguous: { label: "Choose product", cls: "bg-amber-50 text-amber-800" },
  needs_quantity: { label: "Quantity needed", cls: "bg-amber-50 text-amber-800" },
  unit_mismatch: { label: "Check unit", cls: "bg-amber-50 text-amber-800" },
  insufficient_stock: { label: "Low stock", cls: "bg-red-50 text-red-700" },
};

const BLANK_ITEM: Item = {
  heard: "", product_id: null, candidate_ids: [], candidates: [], product_name: null,
  quantity: null, unit: null, unit_price: null, available: null, line_total: null,
  status: "not_found", message: null,
};

function friendly(e: unknown, fallback: string) {
  if (e instanceof TypeError) return "Cannot reach the backend. Is Flask running?";
  return e instanceof Error ? e.message : fallback;
}

async function postJson(path: string, body: unknown) {
  const res = await apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data?.error?.message || "Request failed.");
  return data;
}

export default function VoiceOrdersPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [lang, setLang] = useState("auto");
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [transcript, setTranscript] = useState("");
  const [detected, setDetected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [subtotal, setSubtotal] = useState("0.00");
  const [canConfirm, setCanConfirm] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<ConfirmedOrder | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastWavRef = useRef<Blob | null>(null);
  const reqRef = useRef(0);

  useEffect(() => {
    supabase
      .from("products")
      .select("id,name,unit")
      .order("name")
      .then(({ data }) => setProducts((data as Product[]) ?? []));
  }, []);

  function cleanupAudio() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    streamRef.current = null;
    audioCtxRef.current = null;
    setLevels([]);
  }

  useEffect(() => cleanupAudio, []);

  useEffect(() => {
    if (status === "recording" && seconds >= MAX_SECONDS) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds, status]);

  async function start() {
    setError(null);
    setTranscript("");
    setDetected(null);
    setItems([]);
    setParseError(null);
    setConfirmed(null);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setError("Microphone access was blocked. Allow the microphone in your browser and try again.");
      setStatus("error");
      return;
    }
    streamRef.current = stream;

    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = handleStop;
    recRef.current = rec;

    const ac = new AudioContext();
    audioCtxRef.current = ac;
    const analyser = ac.createAnalyser();
    analyser.fftSize = 64;
    ac.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      setLevels(Array.from(data.slice(0, 16)));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();

    rec.start();
    setSeconds(0);
    setStatus("recording");
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  }

  function stop() {
    if (recRef.current && recRef.current.state !== "inactive") {
      recRef.current.stop();
    }
    cleanupAudio();
  }

  async function handleStop() {
    setStatus("processing");
    try {
      const raw = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || "audio/webm" });
      if (raw.size < 1000) {
        throw new Error("The recording was too short. Hold the mic button a little longer.");
      }
      const wav = await blobToWav16k(raw);
      lastWavRef.current = wav;
      await send(wav);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not process the recording.");
      setStatus("error");
    }
  }

  async function send(wav: Blob) {
    setStatus("processing");
    setError(null);
    try {
      const form = new FormData();
      form.append("audio", wav, "recording.wav");
      form.append("lang", lang);
      const res = await apiFetch("/api/voice/transcribe", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body?.error?.message || "Transcription failed.");
      }
      const text: string = body.transcript || "";
      setTranscript(text);
      setDetected(body.detected_language_code || null);
      setStatus("done");
      if (text.trim()) await parseTranscript(text);
    } catch (e) {
      setError(friendly(e, "Transcription failed."));
      setStatus("error");
    }
  }

  function applyResult(data: { items: Item[]; subtotal: string; can_confirm: boolean }) {
    setItems(data.items);
    setSubtotal(data.subtotal);
    setCanConfirm(data.can_confirm);
  }

  async function parseTranscript(text: string) {
    const id = ++reqRef.current;
    setParsing(true);
    setParseError(null);
    try {
      const data = await postJson("/api/orders/parse", { transcript: text });
      if (id === reqRef.current) applyResult(data);
    } catch (e) {
      if (id === reqRef.current) setParseError(friendly(e, "Could not read the order."));
    } finally {
      if (id === reqRef.current) setParsing(false);
    }
  }

  async function revalidate(next: Item[]) {
    const id = ++reqRef.current;
    setItems(next);
    setParsing(true);
    setParseError(null);
    try {
      const data = await postJson("/api/orders/validate", {
        items: next.map((i) => ({
          product_id: i.product_id,
          candidate_ids: i.candidate_ids,
          quantity: i.quantity,
          unit: i.unit,
          heard: i.heard,
        })),
      });
      if (id === reqRef.current) applyResult(data);
    } catch (e) {
      if (id === reqRef.current) setParseError(friendly(e, "Could not check the order."));
    } finally {
      if (id === reqRef.current) setParsing(false);
    }
  }

  function changeProduct(idx: number, pid: string) {
    revalidate(items.map((it, i) => (i === idx ? { ...it, product_id: pid || null, candidate_ids: [], unit: null } : it)));
  }

  function typeQuantity(idx: number, value: string) {
    setItems(items.map((it, i) => (i === idx ? { ...it, quantity: value, unit: null } : it)));
  }

  function handleConfirmed(order: ConfirmedOrder) {
    reqRef.current++;
    setConfirmed(order);
    setItems([]);
    setTranscript("");
    setDetected(null);
    setSubtotal("0.00");
    setCanConfirm(false);
    setParseError(null);
    setStatus("idle");
  }

  const busy = status === "processing";
  const recording = status === "recording";
  const hasProblem = items.some((i) => i.status !== "ok");

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold text-neutral-900">Voice Orders</h1>
      <p className="mt-1 text-sm text-neutral-600">Press the mic, speak the customer&apos;s order, then press stop.</p>

      <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <label htmlFor="lang" className="text-sm font-medium text-neutral-700">Language</label>
          <select
            id="lang"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            disabled={recording || busy}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900"
          >
            {LANGS.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>

        <div className="mt-8 flex flex-col items-center">
          <button
            onClick={recording ? stop : start}
            disabled={busy}
            aria-label={recording ? "Stop recording" : "Start recording"}
            className={`flex h-24 w-24 items-center justify-center rounded-full text-white shadow-md transition disabled:opacity-60 ${
              recording ? "bg-red-600 hover:bg-red-700" : "bg-emerald-800 hover:bg-emerald-900"
            }`}
          >
            {busy ? <Loader2 size={36} className="animate-spin" /> : recording ? <Square size={32} /> : <Mic size={36} />}
          </button>

          <p className="mt-4 text-sm text-neutral-600" aria-live="polite">
            {status === "idle" && "Ready"}
            {recording && `Recording... ${seconds}s (max ${MAX_SECONDS}s)`}
            {busy && "Processing audio..."}
            {status === "done" && "Done"}
            {status === "error" && "Something went wrong"}
          </p>

          <div className="mt-3 flex h-16 items-end gap-1" aria-hidden="true">
            {levels.map((v, i) => (
              <div key={i} className="w-1.5 rounded bg-emerald-600" style={{ height: `${Math.max(4, (v / 255) * 64)}px` }} />
            ))}
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <p>{error}</p>
            {lastWavRef.current && (
              <button
                onClick={() => lastWavRef.current && send(lastWavRef.current)}
                disabled={busy}
                className="mt-2 inline-flex items-center gap-1 font-medium text-red-800 hover:underline"
              >
                <RotateCcw size={14} /> Retry with the same recording
              </button>
            )}
          </div>
        )}
      </div>

      {confirmed && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-6">
          <div className="flex items-center gap-2 text-emerald-900">
            <CheckCircle2 size={20} />
            <h2 className="text-base font-semibold">Order confirmed</h2>
          </div>
          <p className="mt-2 text-sm text-emerald-900">
            Order <span className="font-semibold">{confirmed.order_number}</span> · Total ₹{confirmed.total_amount}
          </p>
          {confirmed.duplicate && (
            <p className="mt-1 text-sm text-emerald-800">This order was already saved, so nothing was added twice.</p>
          )}
          <p className="mt-2 text-sm text-emerald-800">Stock has been updated. Press the mic to take the next order.</p>
        </div>
      )}

      {status === "done" && (
        <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900">Transcript</h2>
            {detected && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">{detected}</span>}
          </div>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={2}
            aria-label="Transcript"
            className="mt-2 w-full rounded-lg border border-neutral-300 bg-white p-2 text-base text-neutral-900"
          />
          <p className="mt-1 text-xs text-neutral-500">Heard it wrong? Fix the text, then press Update order.</p>
          <button
            onClick={() => parseTranscript(transcript)}
            disabled={parsing || !transcript.trim()}
            className="mt-2 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-60"
          >
            Update order
          </button>
        </div>
      )}

      {(items.length > 0 || parsing || parseError) && (
        <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900">Order</h2>
            {parsing && <Loader2 size={16} className="animate-spin text-neutral-500" />}
          </div>

          {parseError && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <p>{parseError}</p>
              <button
                onClick={() => parseTranscript(transcript)}
                className="mt-2 inline-flex items-center gap-1 font-medium text-red-800 hover:underline"
              >
                <RotateCcw size={14} /> Try again
              </button>
            </div>
          )}

          {items.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs uppercase text-neutral-500">
                  <tr>
                    <th className="py-2 pr-2 font-medium">Product</th>
                    <th className="py-2 pr-2 font-medium">Qty</th>
                    <th className="py-2 pr-2 font-medium">Price</th>
                    <th className="py-2 pr-2 text-right font-medium">Amount</th>
                    <th className="py-2 pr-2 font-medium">Status</th>
                    <th className="py-2"><span className="sr-only">Remove</span></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => {
                    const st = STATUS_STYLE[it.status] ?? STATUS_STYLE.not_found;
                    return (
                      <tr key={idx} className="border-t border-neutral-100 align-top">
                        <td className="py-2 pr-2">
                          <select
                            value={it.product_id ?? ""}
                            onChange={(e) => changeProduct(idx, e.target.value)}
                            aria-label="Product"
                            className="w-44 rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900"
                          >
                            <option value="">Choose product...</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                          {it.heard && <p className="mt-1 text-xs text-neutral-400">Heard: {it.heard}</p>}
                        </td>
                        <td className="py-2 pr-2">
                          <div className="flex items-center gap-1">
                            <input
                              value={it.quantity ?? ""}
                              onChange={(e) => typeQuantity(idx, e.target.value)}
                              onBlur={() => revalidate(items)}
                              inputMode="decimal"
                              aria-label="Quantity"
                              className="w-16 rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900"
                            />
                            <span className="text-neutral-500">{it.unit ?? ""}</span>
                          </div>
                        </td>
                        <td className="py-2 pr-2 text-neutral-700">{it.unit_price ? `₹${it.unit_price}` : "-"}</td>
                        <td className="py-2 pr-2 text-right font-medium text-neutral-900">{it.line_total ? `₹${it.line_total}` : "-"}</td>
                        <td className="py-2 pr-2">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                          {it.message && <p className="mt-1 max-w-[12rem] text-xs text-neutral-500">{it.message}</p>}
                        </td>
                        <td className="py-2">
                          <button
                            onClick={() => revalidate(items.filter((_, i) => i !== idx))}
                            aria-label="Remove item"
                            className="rounded p-1 text-neutral-400 hover:text-red-600"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <button
            onClick={() => revalidate([...items, { ...BLANK_ITEM }])}
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-emerald-800 hover:underline"
          >
            <Plus size={14} /> Add item
          </button>

          {items.length > 0 && (
            <div className="mt-4 border-t border-neutral-200 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-600">Total (items marked OK)</span>
                <span className="text-xl font-semibold text-neutral-900">₹{subtotal}</span>
              </div>
              {hasProblem && (
                <p className="mt-2 flex items-start gap-1 text-sm text-amber-800">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  Some items need attention. The bill is not final until every item shows OK.
                </p>
              )}
                            {!hasProblem && canConfirm && !parsing && (
                <>
                  <SpokenConfirmation
                    items={items.map((i) => ({ product_id: i.product_id, quantity: i.quantity, unit: i.unit }))}
                    detectedLanguage={detected}
                  />
                  <ConfirmOrder
                    items={items.map((i) => ({ product_id: i.product_id, quantity: i.quantity, unit: i.unit }))}
                    total={subtotal}
                    language={detected}
                    onConfirmed={handleConfirmed}
                  />
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}