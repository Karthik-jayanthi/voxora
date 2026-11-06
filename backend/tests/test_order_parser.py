import unittest
from decimal import Decimal

from app.services.billing_service import line_total
from app.services.order_parser import parse_transcript, validate_items


def make_products(**stock):
    def p(pid, name, price, unit, aliases):
        return {"id": pid, "name": name, "price": price, "unit": unit,
                "stock_quantity": stock.get(pid, 100), "aliases": aliases}
    return [
        p("rice", "Rice", 60, "kg", ["rice", "biyyam", "బియ్యం", "akki", "ಅಕ್ಕಿ"]),
        p("oil", "Sunflower Oil", 120, "litre", ["oil", "sunflower oil", "noone", "నూనె", "enne", "ಎಣ್ಣೆ"]),
        p("milk", "Milk", 30, "packet", ["milk", "paalu", "పాలు", "haalu", "ಹಾಲು"]),
        p("sugar", "Sugar", 45, "kg", ["sugar", "panchadara", "sakkare", "ಸಕ್ಕರೆ"]),
        p("potato", "Potato", 40, "kg", ["potato", "aloo", "alugadde", "ಆಲೂಗಡ್ಡೆ"]),
    ]


def run(text, products=None):
    products = products or make_products()
    return validate_items(parse_transcript(text, products), products)


class OrderParserTests(unittest.TestCase):
    def test_english_order(self):
        items, subtotal, ok = run("Give me 2 kg of rice and 1 litre of sunflower oil.")
        self.assertEqual([(i["product_name"], i["quantity"], i["unit"]) for i in items],
                         [("Rice", "2", "kg"), ("Sunflower Oil", "1", "litre")])
        self.assertEqual(subtotal, Decimal("240.00"))
        self.assertTrue(ok)

    def test_telugu_mixed_order_bill_is_330(self):
        items, subtotal, ok = run("అన్నా, 2 కిలోల బియ్యం, 1 లీటర్ oil, 3 ప్యాకెట్లు milk కావాలి.")
        self.assertEqual([i["product_name"] for i in items], ["Rice", "Sunflower Oil", "Milk"])
        self.assertEqual(subtotal, Decimal("330.00"))
        self.assertTrue(ok)

    def test_kannada_mixed_order(self):
        items, subtotal, ok = run("2 kg ಆಲೂಗಡ್ಡೆ ಮತ್ತು 2 ಹಾಲು packet ಕೊಡಿ.")
        self.assertEqual([(i["product_name"], i["quantity"]) for i in items],
                         [("Potato", "2"), ("Milk", "2")])
        self.assertEqual(subtotal, Decimal("140.00"))
        self.assertTrue(ok)

    def test_missing_quantity(self):
        items, subtotal, ok = run("rice venum")
        self.assertEqual(items[0]["product_name"], "Rice")
        self.assertEqual(items[0]["status"], "needs_quantity")
        self.assertFalse(ok)

    def test_unknown_product_is_not_invented(self):
        items, _, ok = run("2 kg chocolate")
        self.assertEqual(items[0]["status"], "not_found")
        self.assertIsNone(items[0]["product_id"])
        self.assertFalse(ok)

    def test_insufficient_stock(self):
        items, _, ok = run("5 kg rice", make_products(rice=2))
        self.assertEqual(items[0]["status"], "insufficient_stock")
        self.assertEqual(items[0]["available"], "2")
        self.assertFalse(ok)

    def test_same_product_twice_counts_total_stock(self):
        items, _, ok = run("3 kg rice and 3 kg rice", make_products(rice=5))
        self.assertEqual([i["status"] for i in items], ["insufficient_stock", "insufficient_stock"])
        self.assertFalse(ok)

    def test_grams_convert_to_kg(self):
        items, subtotal, ok = run("500 g sugar")
        self.assertEqual(items[0]["quantity"], "0.5")
        self.assertEqual(subtotal, Decimal("22.50"))
        self.assertTrue(ok)

    def test_unit_mismatch_is_flagged(self):
        items, _, ok = run("3 packet oil")
        self.assertEqual(items[0]["status"], "unit_mismatch")
        self.assertFalse(ok)

    def test_ambiguous_alias_is_not_guessed(self):
        products = make_products()
        products.append({"id": "gn", "name": "Groundnut Oil", "price": 150, "unit": "litre",
                         "stock_quantity": 10, "aliases": ["oil"]})
        items, _, ok = run("1 litre oil", products)
        self.assertEqual(items[0]["status"], "ambiguous")
        self.assertIsNone(items[0]["product_id"])
        self.assertFalse(ok)

    def test_decimal_money(self):
        self.assertEqual(line_total(Decimal("33.33"), Decimal("3")), Decimal("99.99"))


if __name__ == "__main__":
    unittest.main()