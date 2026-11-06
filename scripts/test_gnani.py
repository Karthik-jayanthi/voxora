"""
Usage (from the backend folder, venv active):
  python ../scripts/test_gnani.py stt ../samples/telugu.wav te
  python ../scripts/test_gnani.py stt ../samples/kannada.wav kn
  python ../scripts/test_gnani.py stt ../samples/english.wav en
  python ../scripts/test_gnani.py tts
Reads GNANI_API_KEY from backend/.env
"""
import os
import sys

import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))

KEY = os.getenv("GNANI_API_KEY", "")
STT_URL = "https://api.vachana.ai/stt/v3"
TTS_URL = "https://api.vachana.ai/api/v1/tts/inference"

LANG_CODES = {"te": "te-IN,en-IN", "kn": "kn-IN,en-IN", "en": "en-IN"}

if not KEY:
    sys.exit("GNANI_API_KEY missing in backend/.env")


def show_error(r):
    print(f"  HTTP {r.status_code}: {r.text[:500]}")


def test_stt(path, lang):
    hint = LANG_CODES.get(lang)
    if hint is None:
        sys.exit("language must be te, kn or en")

    combos = [
        ("indic-auto", "codemix"),
        (hint, "codemix"),
        (hint, "transcribe"),
        (hint, "verbatim"),
        (hint, "transliterate"),
    ]

    for lang_code, fmt in combos:
        print(f"\n== language_code={lang_code} format={fmt}")
        with open(path, "rb") as f:
            r = requests.post(
                STT_URL,
                headers={"X-API-Key-ID": KEY},
                files={"audio_file": (os.path.basename(path), f, "audio/wav")},
                data={"model": "prisma-v3.0", "language_code": lang_code, "format": fmt},
                timeout=60,
            )
        if r.status_code != 200:
            show_error(r)
            continue
        body = r.json()
        print("  transcript:", body.get("transcript"))
        print("  detected  :", body.get("detected_language_code"))
        print("  latency   :", body.get("end_to_end_latency"))


def test_tts():
    tests = [
        ("en-IN", "Your order contains two kilograms of rice and one litre of sunflower oil. Your total bill is three hundred and thirty rupees."),
        ("te-IN", "మీ మొత్తం బిల్లు మూడు వందల ముప్పై రూపాయలు."),
        ("kn-IN", "ನಿಮ್ಮ ಒಟ್ಟು ಬಿಲ್ ಮುನ್ನೂರ ಮೂವತ್ತು ರೂಪಾಯಿಗಳು."),
    ]
    for lang, text in tests:
        print(f"\n== timbre-v3.0 Shivani {lang}")
        r = requests.post(
            TTS_URL,
            headers={"X-API-Key-ID": KEY, "Content-Type": "application/json"},
            json={
                "text": text,
                "voice": "Shivani",
                "model": "timbre-v3.0",
                "language": lang,
                "speed": 1.0,
                "audio_config": {"container": "wav", "sample_rate": 24000},
            },
            timeout=60,
        )
        if r.status_code != 200:
            show_error(r)
            continue
        out = f"tts_test_{lang}.wav"
        with open(out, "wb") as f:
            f.write(r.content)
        print(f"  saved {out} ({len(r.content)} bytes). Play it and check it sounds right.")


if __name__ == "__main__":
    if len(sys.argv) >= 4 and sys.argv[1] == "stt":
        test_stt(sys.argv[2], sys.argv[3])
    elif len(sys.argv) >= 2 and sys.argv[1] == "tts":
        test_tts()
    else:
        sys.exit(__doc__)