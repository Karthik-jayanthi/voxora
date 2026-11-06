from decimal import ROUND_HALF_UP, Decimal

TWO = Decimal("0.01")


def q2(value: Decimal) -> Decimal:
    return value.quantize(TWO, rounding=ROUND_HALF_UP)


def line_total(price: Decimal, qty: Decimal) -> Decimal:
    return q2(price * qty)


def money(value: Decimal) -> str:
    return format(q2(value), "f")


def fmt_qty(value: Decimal) -> str:
    s = format(q2(value), "f")
    return s.rstrip("0").rstrip(".") if "." in s else s