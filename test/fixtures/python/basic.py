from decimal import Decimal


def calculate_total(qty, price):
    return qty * price


format_price = lambda price: f"${price:.2f}"


class InvoiceService:
    def save(self):
        return True

    @staticmethod
    def build():
        return InvoiceService()


class ReceiptService:
    def save(self):
        return False
