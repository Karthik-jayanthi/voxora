import unittest
from decimal import Decimal

from app.services.spoken_text import build_confirmation_text

ITEMS = [
    {"product_name": "Rice", "quantity": "2", "unit": "kg"},
    {"product_name": "Sunflower Oil", "quantity": "1", "unit": "litre"},
    {"product_name": "Milk", "quantity": "3", "unit": "packet"},
]


class SpokenTextTests(unittest.TestCase):
    def test_english_sentence(self):
        text = build_confirmation_text(ITEMS, Decimal("330.00"), "en")
        self.assertEqual(
            text,
            "Your order contains two kilograms of rice, one litre of sunflower oil and three packets "
            "of milk. Your total bill is three hundred and thirty rupees. Would you like to confirm this order?",
        )

    def test_english_paise(self):
        text = build_confirmation_text(ITEMS[:1], Decimal("22.50"), "en")
        self.assertIn("twenty-two rupees and fifty paise", text)

    def test_telugu_and_kannada_build_without_error(self):
        te = build_confirmation_text(ITEMS, Decimal("330.00"), "te")
        kn = build_confirmation_text(ITEMS, Decimal("330.00"), "kn")
        self.assertIn("రూపాయలు", te)
        self.assertIn("బియ్యం", te)
        self.assertIn("ರೂಪಾಯಿಗಳು", kn)
        self.assertIn("ಅಕ್ಕಿ", kn)

    def test_unknown_language_falls_back_to_english(self):
        text = build_confirmation_text(ITEMS, Decimal("330.00"), "xx")
        self.assertTrue(text.startswith("Your order contains"))


if __name__ == "__main__":
    unittest.main()