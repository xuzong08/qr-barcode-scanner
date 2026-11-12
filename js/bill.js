// The bill being rung up right now. Saved in LocalStorage so a reload does
// not lose it. One line per product:
//   { code, name, price, qty }
// name and price are copied into the line when it is added, so changing a
// product's price later does not silently change a bill already in progress.

const STORAGE_KEY = "currentBill";

export function loadBill() {
  try {
    const items = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function saveBill(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// Adds one unit of a product. Scanning the same barcode again raises qty.
export function addItem(code, name, price) {
  const items = loadBill();
  const existing = items.find((item) => item.code === code);
  if (existing) {
    existing.qty += 1;
  } else {
    items.push({ code, name, price, qty: 1 });
  }
  saveBill(items);
}

// Sets the quantity of one line. Zero or less removes the line.
export function setQty(code, qty) {
  const items = loadBill()
    .map((item) => (item.code === code ? { ...item, qty } : item))
    .filter((item) => item.qty > 0);
  saveBill(items);
}

// Changes the name and price on a line already in the bill
export function updateItem(code, name, price) {
  saveBill(loadBill().map((item) => (item.code === code ? { ...item, name, price } : item)));
}

export function clearBill() {
  localStorage.removeItem(STORAGE_KEY);
}

export function billTotal(items) {
  // reduce walks the list and keeps a running sum, starting at 0
  return items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

// --- Finished bills ---------------------------------------------------------
// Kept under their own key, newest first. One finished bill looks like:
//   { id, number, timestamp, items, total }

const BILLS_KEY = "bills";

export function loadBills() {
  try {
    const bills = JSON.parse(localStorage.getItem(BILLS_KEY));
    return Array.isArray(bills) ? bills : [];
  } catch {
    return [];
  }
}

// Closes the current bill: saves it to the finished bills and empties the
// current one. Returns the saved bill, or null if there was nothing to save.
export function finishBill() {
  const items = loadBill();
  if (items.length === 0) return null;

  const bills = loadBills();
  const bill = {
    id: crypto.randomUUID(),
    number: bills.length + 1, // 1, 2, 3 ... in the order bills were finished
    timestamp: new Date().toISOString(),
    items,
    total: billTotal(items), // stored, so the receipt never has to recalculate
  };

  // Save the finished bill first, then empty the current one. If the save
  // failed, the current bill would still be there and nothing is lost.
  localStorage.setItem(BILLS_KEY, JSON.stringify([bill, ...bills]));
  clearBill();
  return bill;
}

// Self-check, runs on every page load. A failed check prints to the Console.
console.assert(billTotal([]) === 0, "empty bill is zero");
console.assert(
  billTotal([{ price: 5000, qty: 2 }, { price: 1500, qty: 3 }]) === 14500,
  "total is the sum of price x qty"
);
