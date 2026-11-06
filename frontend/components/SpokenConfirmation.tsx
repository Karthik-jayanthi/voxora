"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw, Volume2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

type Props = {
  items: { product_id: string | null; quantity: string | null; unit: string | null }[];
  detectedLanguage: string | null;
};

const OPTIONS = [
  { value: "en", label: "English" },
  { value: "te", label: "Telugu" },
  { value: "kn", label: "Kannada" },
];

function fromDetected(code: string | null) {
  if (code?.startsWith("te")) return "te";
  if (code?.startsWith("kn")) return "kn";
  return "en";
}

export default function SpokenConfirmation({ items, detectedLanguage }: Props) {
  const [chosen, setChosen] = useState<string | null>(null);
  const lang = chosen ?? fromDetected(detectedLanguage);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [src, setSrc] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const reqRef = useRef(0);

  // an edited order or a new language needs fresh audio
  const signature = JSON.stringify(items) + lang;
  useEffect(() => {
    reqRef.current++;
    setText(null);
    setSrc(null);
    setError(null);
    setLoading(false);
  }, [signature]);

  async function speak() {
    if (loading) return;
    if (src && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
      return;
    }

    const id = ++reqRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/voice/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, language: lang }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) {
        throw new Error(body?.error?.message || "Could not generate the voice.");
      }
      if (id !== reqRef.current) return;
      setText(body.text);
      setSrc(`data:${body.mime};base64,${body.audio_base64}`);
    } catch (e) {
      if (id !== reqRef.current) return;
      setError(
        e instanceof TypeError
          ? "Cannot reach the backend. Is Flask running?"
          : e instanceof Error
            ? e.message
            : "Could not generate the voice."
      );
    } finally {
      if (id === reqRef.current) setLoading(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <label htmlFor="speech-lang" className="text-sm font-medium text-neutral-700">Spoken language</label>
          <select
            id="speech-lang"
            value={lang}
            onChange={(e) => setChosen(e.target.value)}
            disabled={loading}
            className="rounded-lg border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900"
          >
            {OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <button
          onClick={speak}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-800 px-3 py-1.5 text-sm font-medium text-emerald-900 hover:bg-emerald-50 disabled:opacity-60"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Volume2 size={16} />}
          {loading ? "Generating voice..." : src ? "Replay" : "Read order aloud"}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p>{error}</p>
          <button onClick={speak} className="mt-2 inline-flex items-center gap-1 font-medium text-red-800 hover:underline">
            <RotateCcw size={14} /> Try again
          </button>
        </div>
      )}

      {text && src && (
        <div className="mt-3">
          <p className="text-sm text-neutral-900">{text}</p>
          <audio ref={audioRef} src={src} controls autoPlay className="mt-2 w-full" />
        </div>
      )}
    </div>
  );
}