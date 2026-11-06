import difflib
import re
import unicodedata
from decimal import Decimal, InvalidOperation

from .billing_service import fmt_qty, line_total, q2

STRIP_CHARS = ".,;:!?()[]{}\"'“”‘’। "
NUM_RE = re.compile(r"^\d+(?:\.\d+)?$")
NUM_PREFIX_RE = re.compile(r"^(\d+(?:\.\d+)?)(\D.*)$")
MAX_QTY = Decimal("10000")

WORD_NUMBERS = {
    "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
    "six": "6", "seven": "7", "eight": "8", "nine": "9", "ten": "10",
    "half": "0.5",
}

EXACT_UNITS = {
    "g": "g", "gm": "g", "gms": "g", "gram": "g", "grams": "g",
    "ml": "ml", "l": "litre",
}

# (canonical unit, accepted word beginnings in English, Telugu and Kannada)
UNIT_PREFIXES = [
    ("kg", ("kg", "kilo", "కిలో", "కేజీ", "కెజి", "ಕೆಜಿ", "ಕಿಲೋ", "ಕಿಲೊ")),
    ("litre", ("litre", "liter", "ltr", "లీటర్", "లీటరు", "ಲೀಟರ್", "ಲೀಟರು")),
    ("packet", ("packet", "pkt", "ప్యాకెట్", "ప్యాకేట్", "ಪ್ಯಾಕೆಟ್", "ಪ್ಯಾಕೇಟ್")),
    ("g", ("గ్రా", "ಗ್ರಾ")),
]


def norm(text) -> str:
    return unicodedata.normalize("NFC", str(text)).strip(STRIP_CHARS).lower()


def unit_of(token: str):
    if token in EXACT_UNITS:
        return EXACT_UNITS[token]
    for canon, prefixes in UNIT_PREFIXES:
        if token.startswith(prefixes):
            return canon
    return None


def canon_unit(unit):
    if not unit:
        return None
    n = norm(unit)
    return unit_of(n) or n


def to_decimal(value):
    if value is None or value == "":
        return None
    try:
        d = Decimal(str(value))
    except InvalidOperation:
        return None
    return d if d.is_finite() else None


def tokenize(text) -> list[str]:
    tokens: list[str] = []
    for raw in str(text).split():
        t = norm(raw)
        if not t:
            continue
        m = NUM_PREFIX_RE.match(t)
        if m:
            tokens.extend([m.group(1), m.group(2)])  # "2kg" -> "2", "kg"
        else:
            tokens.append(t)
    return tokens


def is_number(token: str) -> bool:
    return bool(NUM_RE.match(token)) or token in WORD_NUMBERS


def number_value(token: str) -> Decimal:
    return Decimal(WORD_NUMBERS.get(token, token))


def build_index(products: list[dict]) -> dict:
    index: dict[tuple, list] = {}
    for p in products:
        for name in [p["name"], *(p.get("aliases") or [])]:
            toks = tuple(tokenize(name))
            if toks:
                ids = index.setdefault(toks, [])
                if p["id"] not in ids:
                    ids.append(p["id"])
    return index


def fuzzy_single(token: str, singles: list[str]):
    if token.isascii():
        pool = [s for s in singles if s.isascii()]
        hit = difflib.get_close_matches(token, pool, n=1, cutoff=0.84)
        return hit[0] if hit else None
    # Telugu/Kannada words carry endings, so accept an alias as a word beginning
    pool = [s for s in singles if not s.isascii() and len(s) >= 3 and token.startswith(s)]
    return max(pool, key=len) if pool else None


def find_products(tokens: list[str], index: dict) -> list[tuple]:
    """Returns [(position, [product ids], matched text)] in spoken order."""
    used = [False] * len(tokens)
    found: list[tuple] = []
    max_n = max((len(k) for k in index), default=1)

    for n in range(max_n, 0, -1):
        for i in range(len(tokens) - n + 1):
            if any(used[i:i + n]):
                continue
            ids = index.get(tuple(tokens[i:i + n]))
            if ids:
                found.append((i, list(ids), " ".join(tokens[i:i + n])))
                for j in range(i, i + n):
                    used[j] = True

    singles = [k[0] for k in index if len(k) == 1]
    for i, t in enumerate(tokens):
        if used[i] or len(t) < 3 or is_number(t) or unit_of(t):
            continue
        hit = fuzzy_single(t, singles)
        if hit:
            found.append((i, list(index[(hit,)]), t))
            used[i] = True

    found.sort(key=lambda x: x[0])
    return found


def _item(heard, ids, qty, unit):
    return {
        "heard": heard,
        "product_id": ids[0] if len(ids) == 1 else None,
        "candidate_ids": ids if len(ids) > 1 else [],
        "quantity": fmt_qty(qty) if qty is not None else None,
        "unit": unit,
    }


def parse_transcript(transcript: str, products: list[dict]) -> list[dict]:
    index = build_index(products)
    tokens = tokenize(transcript)

    num_idx = [i for i, t in enumerate(tokens) if is_number(t)]
    preamble = tokens[: num_idx[0]] if num_idx else tokens

    items: list[dict] = []
    pending: list[dict] = []  # products named before any quantity ("rice venum")

    for _, ids, text in find_products(preamble, index):
        it = _item(text, ids, None, None)
        items.append(it)
        pending.append(it)

    for k, i in enumerate(num_idx):
        end = num_idx[k + 1] if k + 1 < len(num_idx) else len(tokens)
        qty = number_value(tokens[i])
        seg = tokens[i + 1:end]
        unit = next((u for u in (unit_of(t) for t in seg) if u), None)
        heard = f"{fmt_qty(qty)} {' '.join(seg)}".strip()
        found = find_products(seg, index)

        if not found:
            if pending:  # "rice ... 2 kg"
                it = pending.pop(0)
                it["quantity"] = fmt_qty(qty)
                it["unit"] = unit
            else:
                items.append(_item(heard, [], qty, unit))
            continue

        for n, (_, ids, _text) in enumerate(found):
            # only the first product in a segment gets the number; the rest ask for one
            items.append(_item(heard, ids, qty if n == 0 else None, unit if n == 0 else None))

    return items


def validate_items(raw_items: list[dict], products: list[dict]):
    by_id = {str(p["id"]): p for p in products}
    prepared = []
    requested: dict[str, Decimal] = {}

    for it in raw_items:
        pid = it.get("product_id")
        product = by_id.get(str(pid)) if pid else None
        cand_ids = [c for c in (it.get("candidate_ids") or []) if str(c) in by_id]
        qty = to_decimal(it.get("quantity"))
        status = message = None
        unit_out = None

        if product is None:
            if len(cand_ids) > 1:
                status, message = "ambiguous", "More than one product matches. Choose the right one."
            else:
                status, message = "not_found", "Not found in inventory. Choose a product manually."
        elif qty is None or qty <= 0:
            status, message = "needs_quantity", "Enter a quantity."
            unit_out = product["unit"]
        else:
            pu = canon_unit(product["unit"])
            su = canon_unit(it.get("unit"))
            unit_out = product["unit"]
            if su is None or su == pu:
                pass
            elif su == "g" and pu == "kg":
                qty = qty / 1000
            elif su == "ml" and pu == "litre":
                qty = qty / 1000
            else:
                status = "unit_mismatch"
                message = f"Heard '{it.get('unit')}', but this product is sold per {product['unit']}. Check the quantity."
                unit_out = it.get("unit")

            if status is None:
                qty = q2(qty)
                if qty <= 0 or qty > MAX_QTY:
                    status, message = "needs_quantity", "Enter a valid quantity."
                else:
                    key = str(product["id"])
                    requested[key] = requested.get(key, Decimal("0")) + qty

        prepared.append(
            {"it": it, "product": product, "cand_ids": cand_ids, "qty": qty,
             "status": status, "message": message, "unit": unit_out}
        )

    results = []
    subtotal = Decimal("0")

    for p in prepared:
        product, qty, status, message = p["product"], p["qty"], p["status"], p["message"]
        stock = Decimal(str(product["stock_quantity"])) if product else None

        if status is None:
            if requested[str(product["id"])] > stock:
                status = "insufficient_stock"
                message = f"Only {fmt_qty(stock)} {product['unit']} in stock."
            else:
                status = "ok"

        price = Decimal(str(product["price"])) if product else None
        lt = None
        if product and qty is not None and status in ("ok", "insufficient_stock"):
            lt = line_total(price, qty)
            if status == "ok":
                subtotal += lt

        results.append({
            "heard": p["it"].get("heard", ""),
            "product_id": str(product["id"]) if product else None,
            "candidate_ids": [str(c) for c in p["cand_ids"]] if not product else [],
            "candidates": [{"id": str(by_id[str(c)]["id"]), "name": by_id[str(c)]["name"]} for c in p["cand_ids"]] if not product else [],
            "product_name": product["name"] if product else None,
            "quantity": fmt_qty(qty) if qty is not None else None,
            "unit": p["unit"],
            "unit_price": format(q2(price), "f") if price is not None else None,
            "available": fmt_qty(stock) if stock is not None else None,
            "line_total": format(lt, "f") if lt is not None else None,
            "status": status,
            "message": message,
        })

    can_confirm = bool(results) and all(r["status"] == "ok" for r in results)
    return results, subtotal, can_confirm