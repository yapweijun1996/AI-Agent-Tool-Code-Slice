import { readFile } from "node:fs";

export function calculateTotal(qty, price) {
  return qty * price;
}

export const formatPrice = (price) => {
  return `$${price.toFixed(2)}`;
};

class Invoice {
  constructor(id) {
    this.id = id;
  }

  save() {
    return true;
  }
}

class Receipt {
  save() {
    return false;
  }
}
