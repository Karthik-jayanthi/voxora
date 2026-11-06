from decimal import Decimal

from num2words import num2words

from .billing_service import fmt_qty
from .order_parser import canon_unit

LANG_CODES = {"en": "en-IN", "te": "te-IN", "kn": "kn-IN"}

UNITS = {
    "en": {
        "kg": ("kilogram", "kilograms"),
        "g": ("gram", "grams"),
        "litre": ("litre", "litres"),
        "ml": ("millilitre", "millilitres"),
        "packet": ("packet", "packets"),
    },
    "te": {"kg": "కిలోలు", "g": "గ్రాములు", "litre": "లీటర్లు", "ml": "మిల్లీలీటర్లు", "packet": "ప్యాకెట్లు"},
    "kn": {"kg": "ಕಿಲೋ", "g": "ಗ್ರಾಂ", "litre": "ಲೀಟರ್", "ml": "ಮಿಲಿಲೀಟರ್", "packet": "ಪ್ಯಾಕೆಟ್"},
}

# Spoken names for the starter products. Any other product is spoken by its stored name.
NAMES = {
    "te": {
        "rice": "బియ్యం", "sunflower oil": "పొద్దుతిరుగుడు నూనె", "milk": "పాలు",
        "sugar": "పంచదార", "wheat flour": "గోధుమ పిండి", "potato": "బంగాళాదుంప",
    },
    "kn": {
        "rice": "ಅಕ್ಕಿ", "sunflower oil": "ಸೂರ್ಯಕಾಂತಿ ಎಣ್ಣೆ", "milk": "ಹಾಲು",
        "sugar": "ಸಕ್ಕರೆ", "wheat flour": "ಗೋಧಿ ಹಿಟ್ಟು", "potato": "ಆಲೂಗಡ್ಡೆ",
    },
}

CONJ = {"en": " and ", "te": " మరియు ", "kn": " ಮತ್ತು "}
RUPEES = {"en": "rupees", "te": "రూపాయలు", "kn": "ರೂಪಾಯಿಗಳು"}
PAISE = {"en": "paise", "te": "పైసలు", "kn": "ಪೈಸೆ"}

TEMPLATE = {
    "en": "Your order contains {items}. Your total bill is {total}. Would you like to confirm this order?",
    "te": "మీ ఆర్డర్లో {items} ఉన్నాయి. మొత్తం బిల్లు {total}. ఈ ఆర్డర్ను నిర్ధారించమంటారా?",
    "kn": "ನಿಮ್ಮ ಆರ్డರ್ನಲ್ಲಿ {items} ಇವೆ. ಒಟ್ಟು ಬಿಲ್ {total}. ಈ ಆರ್ಡರ್ ಅನ್ನು ದೃಢೀಕರಿಸಬೇಕೇ?",
}


def words(value: Decimal, lang: str) -> str:
    try:
        if value == value.to_integral_value():
            return num2words(int(value), lang=lang)
        return num2words(float(value), lang=lang)
    except Exception:
        return fmt_qty(value)


def join(parts: list[str], lang: str) -> str:
    if len(parts) == 1:
        return parts[0]
    return ", ".join(parts[:-1]) + CONJ[lang] + parts[-1]


def item_phrase(item: dict, lang: str) -> str:
    qty = Decimal(str(item["quantity"]))
    name = item["product_name"]
    unit = canon_unit(item["unit"]) or str(item["unit"])
    w = words(qty, lang)

    if lang == "en":
        forms = UNITS["en"].get(unit)
        unit_word = (forms[0] if qty == 1 else forms[1]) if forms else str(item["unit"])
        return f"{w} {unit_word} of {name.lower()}"

    unit_word = UNITS[lang].get(unit, str(item["unit"]))
    spoken_name = NAMES[lang].get(name.strip().lower(), name)
    return f"{w} {unit_word} {spoken_name}"


def total_phrase(total: Decimal, lang: str) -> str:
    rupees = int(total)
    paise = int((total * 100) % 100)
    text = f"{words(Decimal(rupees), lang)} {RUPEES[lang]}"
    if paise:
        joiner = " and " if lang == "en" else " "
        text += f"{joiner}{words(Decimal(paise), lang)} {PAISE[lang]}"
    return text


def build_confirmation_text(items: list[dict], subtotal: Decimal, lang: str) -> str:
    if lang not in TEMPLATE:
        lang = "en"
    phrases = [item_phrase(i, lang) for i in items]
    return TEMPLATE[lang].format(items=join(phrases, lang), total=total_phrase(subtotal, lang))