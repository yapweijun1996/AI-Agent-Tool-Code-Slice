import { Invoice } from "./invoice";

export interface LineItem {
  qty: number;
  price: number;
}

export type Total = number;

export function calculateTotal(qty: number, price: number): Total {
  return qty * price;
}

export const formatPrice = (price: number): string => {
  return `$${price.toFixed(2)}`;
};

class InvoiceService {
  save(invoice: Invoice): boolean {
    return true;
  }
}

class ReceiptService {
  save(): boolean {
    return false;
  }
}
