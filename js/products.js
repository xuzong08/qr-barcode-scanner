// The app's memory of products: which barcode is which item, and its price.
// Saved in LocalStorage as one object, with the barcode as the key:
//   { "4006381333931": { name: "Pen", price: 5000 }, ... }
// Prices are whole Rupiah, stored as plain numbers.

const STORAGE_KEY = "products";

function loadProducts() {
  try {
    const products = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return products && typeof products === "object" ? products : {};
  } catch {
    return {};
  }
}

// Returns { name, price } for a barcode, or null if it was never saved
export function getProduct(code) {
  return loadProducts()[code] ?? null;
}

export function saveProduct(code, name, price) {
  const products = loadProducts();
  products[code] = { name, price };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
}

// Turns what the user typed into whole Rupiah, or null if it is not a price.
// Accepts "15000", "15.000" and "Rp 15.000".
export function parsePrice(text) {
  const digits = String(text).replace(/[^\d]/g, "");
  return digits === "" ? null : Number(digits);
}

// 15000 -> "Rp 15.000"
const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export function formatPrice(amount) {
  return rupiah.format(amount);
}

// Self-check, runs on every page load. A failed check prints to the Console.
console.assert(parsePrice("15000") === 15000, "plain number");
console.assert(parsePrice("Rp 15.000") === 15000, "formatted Rupiah");
console.assert(parsePrice("abc") === null, "no digits is not a price");
console.assert(parsePrice("") === null, "empty is not a price");
