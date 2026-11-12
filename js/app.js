// Entry point: connects the buttons in index.html to scanner.js, history.js and export.js.

import {
  listCameras,
  startCamera,
  stopCamera,
  cameraResolution,
  cameraErrorMessage,
  scanImage,
  imageErrorMessage,
} from "./scanner.js";
import {
  loadHistory,
  addScan,
  deleteScan,
  renameScan,
  clearHistory,
  searchHistory,
} from "./history.js";
import { downloadCsv, downloadBillsCsv } from "./export.js";
import { getProduct, saveProduct, parsePrice, formatPrice } from "./products.js";
import {
  loadBill,
  addItem,
  setQty,
  updateItem,
  billTotal,
  clearBill,
  finishBill,
  loadBills,
} from "./bill.js";

// ---------------------------------------------------------------------------
// Navigation: the Camera and Upload buttons swap which view is visible
// ---------------------------------------------------------------------------

// Only nav items that have a data-view attribute. The History link has none,
// so the browser handles it as a normal jump to #history.
const navButtons = document.querySelectorAll(".nav-item[data-view]");
const views = document.querySelectorAll(".view");

function showView(name) {
  // Leaving the camera view must turn the camera off
  if (name !== "camera") {
    stopScanning();
  }

  views.forEach((view) => {
    // Hide every view except the one whose id matches, e.g. "view-upload"
    view.hidden = view.id !== `view-${name}`;
  });

  navButtons.forEach((button) => {
    const isActive = button.dataset.view === name;
    button.classList.toggle("active", isActive);
    // Tells screen readers which item is the current one
    if (isActive) {
      button.setAttribute("aria-current", "true");
    } else {
      button.removeAttribute("aria-current");
    }
  });
}

navButtons.forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.view));
});

// ---------------------------------------------------------------------------
// Theme: light / dark, remembered between visits
// ---------------------------------------------------------------------------

const THEME_KEY = "theme";
const themeToggle = document.getElementById("theme-toggle");
const themeIcon = document.getElementById("theme-icon");
const themeLabel = document.getElementById("theme-label");

function applyTheme(theme) {
  // Sets <html data-theme="...">, which switches the CSS variables in style.css
  document.documentElement.dataset.theme = theme;

  // The button offers the opposite of the current theme
  themeIcon.textContent = theme === "dark" ? "☀️" : "🌙";
  themeLabel.textContent = theme === "dark" ? "Light mode" : "Dark mode";
}

// First visit: follow the device setting. Later visits: use the saved choice.
// shortcut: runs after first paint, so dark users see a brief light flash on
// load. Upgrade to a small inline script in <head> if that becomes annoying.
const savedTheme = localStorage.getItem(THEME_KEY);
const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
applyTheme(savedTheme ?? (systemPrefersDark ? "dark" : "light"));

themeToggle.addEventListener("click", () => {
  const current = document.documentElement.dataset.theme;
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  localStorage.setItem(THEME_KEY, next);
});

// ---------------------------------------------------------------------------
// Camera scanner: Start / Stop buttons and the camera picker
// ---------------------------------------------------------------------------

const cameraView = document.getElementById("view-camera");
const cameraSelect = document.getElementById("camera-select");
const startBtn = document.getElementById("start-btn");
const stopBtn = document.getElementById("stop-btn");
const cameraError = document.getElementById("camera-error");
const cameraStatus = document.getElementById("camera-status");

let camerasLoaded = false;
let isScanning = false;
let framesChecked = 0;
let lastRead = ""; // name or content of the latest scan, shown in the status line

// Keeps the two buttons in step with the camera: only one is usable at a time
function setScanning(scanning) {
  isScanning = scanning;
  startBtn.disabled = scanning;
  stopBtn.disabled = !scanning;
  cameraStatus.hidden = !scanning;
}

// Status line under the video. A rising counter proves the scanner is
// looking at pictures; a small camera size explains unreadable barcodes.
function showCameraStatus() {
  const { width, height } = cameraResolution();
  const last = lastRead ? ` · last read: ${lastRead}` : "";
  cameraStatus.textContent = `Camera ${width}×${height} · pictures checked: ${framesChecked}${last}`;
}

function countFrame() {
  framesChecked += 1;
  // The first pictures can arrive a moment before the camera reports "started"
  if (isScanning) {
    showCameraStatus();
  }
}

// Shows an error under the scanner. An empty message hides it again.
function showCameraError(message) {
  cameraError.textContent = message;
  cameraError.hidden = message === "";
}

// Fills the <select> with the device's cameras
async function loadCameras() {
  const cameras = await listCameras();
  if (cameras.length === 0) {
    throw new Error("NotFoundError");
  }

  cameraSelect.replaceChildren(); // remove the placeholder option
  cameras.forEach((camera, index) => {
    const label = camera.label || `Camera ${index + 1}`;
    cameraSelect.add(new Option(label, camera.id));
  });

  // Phones have front and back cameras. The back one is better for scanning.
  const backCamera = cameras.find((camera) => /back|rear|environment/i.test(camera.label));
  if (backCamera) {
    cameraSelect.value = backCamera.id;
  }

  cameraSelect.disabled = false;
  camerasLoaded = true;
}

async function startScanning() {
  showCameraError("");
  startBtn.disabled = true; // blocks a second click while the camera starts

  try {
    if (!camerasLoaded) {
      await loadCameras();
    }
    framesChecked = 0;
    lastRead = "";
    await startCamera(cameraSelect.value, handleScan, countFrame);
    setScanning(true);
    showCameraStatus();

    // The user may have switched to Upload while the camera was starting
    if (cameraView.hidden) {
      await stopScanning();
    }
  } catch (error) {
    setScanning(false);
    showCameraError(cameraErrorMessage(error));
  }
}

async function stopScanning() {
  await stopCamera();
  setScanning(false);
}

startBtn.addEventListener("click", startScanning);
stopBtn.addEventListener("click", stopScanning);

// Picking another camera while scanning restarts the scanner on that camera
cameraSelect.addEventListener("change", async () => {
  if (isScanning) {
    await stopScanning();
    await startScanning();
  }
});

// ---------------------------------------------------------------------------
// Result: what happens when a code is read
// ---------------------------------------------------------------------------

const resultCard = document.getElementById("result");
const resultType = document.getElementById("result-type");
const resultContent = document.getElementById("result-content");
const resultTime = document.getElementById("result-time");
const copyBtn = document.getElementById("copy-btn");
const openLink = document.getElementById("open-link");

// The scan currently shown in the result card
let currentScan = null;

// Returns a safe web address if the text is an http(s) URL, otherwise null.
// Only http and https are allowed: a QR code can contain "javascript:..."
// which would run code if we put it in a link.
function httpUrl(text) {
  try {
    const url = new URL(text.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null; // new URL() throws when the text is not a URL at all
  }
}

// Self-check, runs on every page load. A failed check prints to the Console.
console.assert(httpUrl("https://example.com/a?b=1") !== null, "https URL accepted");
console.assert(httpUrl(" http://example.com ") !== null, "spaces around URL ignored");
console.assert(httpUrl("javascript:alert(1)") === null, "javascript: rejected");
console.assert(httpUrl("4006381333931") === null, "barcode digits are not a URL");
console.assert(httpUrl("example.com") === null, "no scheme is not a URL");

// Called by the camera each time a code comes into view. The camera stays
// on, so the next item can be scanned straight away.
function handleScan(content, format) {
  showResult(content, format);
  lastRead = currentScan.name || content;
  showCameraStatus();
}

function showResult(content, format) {
  // One record per scan. Stage 7 saves this same object to history.
  currentScan = {
    id: crypto.randomUUID(),
    name: "",
    type: format === "QR_CODE" ? "QR Code" : "Barcode",
    format: format.replaceAll("_", "-"), // "EAN_13" reads better as "EAN-13"
    content,
    timestamp: new Date().toISOString(),
  };

  // "QR Code", or "Barcode · EAN-13" so the user sees which kind
  resultType.textContent =
    currentScan.type === "QR Code" ? "QR Code" : `Barcode · ${currentScan.format}`;

  // textContent (not innerHTML) shows the scanned text as plain text, so a
  // code containing HTML or script cannot run on our page.
  resultContent.textContent = content;

  // Shown in the user's own date format; the exact time stays in the attribute
  resultTime.dateTime = currentScan.timestamp;
  resultTime.textContent = new Date(currentScan.timestamp).toLocaleString();

  const url = httpUrl(content);
  openLink.hidden = url === null;
  if (url) {
    openLink.href = url;
  } else {
    openLink.removeAttribute("href");
  }

  resultCard.hidden = false;

  // Every scan, QR code or barcode, is treated as an item for the bill
  const product = addBarcodeToBill(content);
  if (product) {
    currentScan.name = product.name; // history shows the product name too
  }

  addScan(currentScan);
  renderHistory();
}

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(currentScan.content);
    copyBtn.textContent = "Copied!";
  } catch {
    // Clipboard can be blocked, e.g. on a page that is not localhost or https
    copyBtn.textContent = "Copy failed";
  }
  // Put the normal label back after a moment
  setTimeout(() => {
    copyBtn.textContent = "Copy";
  }, 1500);
});

// ---------------------------------------------------------------------------
// Upload: read a code from an image file
// ---------------------------------------------------------------------------

const fileInput = document.getElementById("file-input");
const uploadError = document.getElementById("upload-error");

// "change" fires when the user has picked a file
fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return; // the user closed the picker without choosing

  uploadError.hidden = true;

  try {
    const { content, format } = await scanImage(file);
    showResult(content, format);
  } catch (error) {
    uploadError.textContent = imageErrorMessage(error);
    uploadError.hidden = false;
  }

  // Clear the picker so choosing the same file again still fires "change"
  fileInput.value = "";
});

// ---------------------------------------------------------------------------
// History: the list of saved scans, with search, rename and delete
// ---------------------------------------------------------------------------

const historyList = document.getElementById("history-list");
const historyEmpty = document.getElementById("history-empty");
const searchInput = document.getElementById("search-input");
const clearBtn = document.getElementById("clear-btn");

// Small helper: makes an element, sets its class and text in one go.
// Text always goes in through textContent, never innerHTML (see showResult).
function makeElement(tag, className, text = "") {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

// Builds the <li> for one scan
function createHistoryItem(scan) {
  const title = scan.name || scan.content; // no name yet: show the content
  const item = makeElement("li", "history-item");

  item.append(makeElement("p", "history-title", title));
  if (scan.name) {
    // A named scan still shows what the code actually says
    item.append(makeElement("p", "history-content", scan.content));
  }

  const kind = scan.type === "QR Code" ? "QR Code" : `Barcode · ${scan.format}`;
  const time = new Date(scan.timestamp).toLocaleString();
  item.append(makeElement("p", "history-meta", `${kind} · ${time}`));

  const renameBtn = makeElement("button", "btn btn-small", "Rename");
  renameBtn.type = "button";
  renameBtn.addEventListener("click", () => {
    // prompt() returns null when the user presses Cancel
    const name = prompt("Name for this scan (leave empty to remove the name):", scan.name);
    if (name === null) return;
    renameScan(scan.id, name.trim());
    renderHistory();
  });

  const deleteBtn = makeElement("button", "btn btn-small btn-danger", "Delete");
  deleteBtn.type = "button";
  deleteBtn.addEventListener("click", () => {
    deleteScan(scan.id);
    renderHistory();
  });

  const actions = makeElement("div", "controls");
  actions.append(renameBtn, deleteBtn);
  item.append(actions);

  return item;
}

// Redraws the whole list from what is saved. Called after every change, so
// the page can never show something different from LocalStorage.
function renderHistory() {
  const scans = searchHistory(searchInput.value);
  historyList.replaceChildren(...scans.map(createHistoryItem));

  historyEmpty.hidden = scans.length > 0;
  historyEmpty.textContent =
    loadHistory().length === 0 ? "No scans yet." : "No scans match your search.";
}

// "input" fires on every keystroke, so the list filters as you type
searchInput.addEventListener("input", renderHistory);

clearBtn.addEventListener("click", () => {
  if (loadHistory().length === 0) return;
  // Deleting everything cannot be undone, so ask first
  if (confirm("Delete all saved scans? This cannot be undone.")) {
    clearHistory();
    renderHistory();
  }
});

// Show saved scans as soon as the page opens
renderHistory();

// ---------------------------------------------------------------------------
// Export: download the whole history as a CSV file
// ---------------------------------------------------------------------------

const exportBtn = document.getElementById("export-btn");

exportBtn.addEventListener("click", () => {
  const scans = loadHistory(); // everything, not only what the search shows
  if (scans.length === 0) {
    alert("There are no scans to export yet.");
    return;
  }
  downloadCsv(scans);
});

// ---------------------------------------------------------------------------
// Bill: scanned products with quantity, price and total, like a cashier
// ---------------------------------------------------------------------------

const billTable = document.getElementById("bill-table");
const billRows = document.getElementById("bill-rows");
const billTotalCell = document.getElementById("bill-total");
const billEmpty = document.getElementById("bill-empty");
const billButtons = document.getElementById("bill-buttons");

// Asks the user for a product's name and price.
// Returns { name, price }, or null if they cancelled or typed no valid price.
function askProductDetails(code, current) {
  const name = prompt(`Product name for barcode ${code}:`, current?.name ?? "");
  if (name === null || name.trim() === "") return null;

  const priceText = prompt(`Price of "${name.trim()}" in Rupiah:`, current?.price ?? "");
  if (priceText === null) return null;

  const price = parsePrice(priceText);
  if (price === null) {
    alert("That is not a price. Type digits only, for example 15000.");
    return null;
  }

  return { name: name.trim(), price };
}

// Adds one unit of the scanned barcode to the bill. A barcode seen for the
// first time is asked about once, then remembered in products.js.
// Returns the product, or null if the user cancelled.
function addBarcodeToBill(code) {
  let product = getProduct(code);

  if (!product) {
    product = askProductDetails(code, null);
    if (!product) return null;
    saveProduct(code, product.name, product.price);
  }

  addItem(code, product.name, product.price);
  renderBill();
  return product;
}

// Small button used inside a bill row
function makeRowButton(label, description, onClick) {
  const button = makeElement("button", "btn btn-small", label);
  button.type = "button";
  button.setAttribute("aria-label", description); // read out by screen readers
  button.addEventListener("click", onClick);
  return button;
}

// Builds the <tr> for one line of the bill
function createBillRow(item) {
  const row = document.createElement("tr");

  const actions = makeElement("td", "bill-actions");
  actions.append(
    makeRowButton("−", `One less ${item.name}`, () => {
      setQty(item.code, item.qty - 1); // reaching 0 removes the line
      renderBill();
    }),
    makeRowButton("+", `One more ${item.name}`, () => {
      setQty(item.code, item.qty + 1);
      renderBill();
    }),
    makeRowButton("Edit", `Edit ${item.name}`, () => {
      const product = askProductDetails(item.code, item);
      if (!product) return;
      saveProduct(item.code, product.name, product.price); // remembered for next time
      updateItem(item.code, product.name, product.price); // and fixed on this bill
      renderBill();
    })
  );

  row.append(
    makeElement("td", "", item.name),
    makeElement("td", "bill-number", item.qty),
    makeElement("td", "bill-number", formatPrice(item.price)),
    makeElement("td", "bill-number", formatPrice(item.price * item.qty)),
    actions
  );
  return row;
}

// Redraws the bill from what is saved, same idea as renderHistory()
function renderBill() {
  const items = loadBill();
  billRows.replaceChildren(...items.map(createBillRow));
  billTotalCell.textContent = formatPrice(billTotal(items));

  billTable.hidden = items.length === 0;
  billButtons.hidden = items.length === 0;
  billEmpty.hidden = items.length > 0;
}

// Show a bill left over from before the page was reloaded
renderBill();

// ---------------------------------------------------------------------------
// Typed barcode: fallback when the camera cannot read a code
// ---------------------------------------------------------------------------

const manualForm = document.getElementById("manual-form");
const manualInput = document.getElementById("manual-input");

// "submit" fires for both the button and the Enter key
manualForm.addEventListener("submit", (event) => {
  event.preventDefault(); // a form normally reloads the page; stop that

  const code = manualInput.value.trim();
  if (code === "") return;

  // Same path as a scan, so the bill, product memory and history all work.
  // "TYPED" is shown as the format instead of e.g. EAN-13.
  showResult(code, "TYPED");
  manualInput.value = "";
  manualInput.focus(); // ready for the next item
});

// ---------------------------------------------------------------------------
// Finishing a bill, past bills and the printed receipt
// ---------------------------------------------------------------------------

const finishBtn = document.getElementById("finish-btn");
const cancelBillBtn = document.getElementById("cancel-bill-btn");
const billsList = document.getElementById("bills-list");
const billsEmpty = document.getElementById("bills-empty");
const receipt = document.getElementById("receipt");

finishBtn.addEventListener("click", () => {
  finishBill();
  renderBill();
  renderPastBills();
});

cancelBillBtn.addEventListener("click", () => {
  if (confirm("Throw away the current bill? This cannot be undone.")) {
    clearBill();
    renderBill();
  }
});

// Builds the <li> for one finished bill
function createPastBillItem(bill) {
  const item = makeElement("li", "history-item");
  const when = new Date(bill.timestamp).toLocaleString();

  // <details> is a built-in fold-out: click the summary to show the items.
  // The browser handles opening and closing, no JavaScript needed.
  const details = document.createElement("details");
  details.append(
    makeElement("summary", "history-title", `Bill #${bill.number} · ${formatPrice(bill.total)}`)
  );
  const lines = makeElement("ul", "bill-lines");
  bill.items.forEach((line) => {
    const text = `${line.qty} × ${line.name} — ${formatPrice(line.price * line.qty)}`;
    lines.append(makeElement("li", "", text));
  });
  details.append(lines);

  const printBtn = makeElement("button", "btn btn-small", "Print receipt");
  printBtn.type = "button";
  printBtn.addEventListener("click", () => printReceipt(bill));

  const actions = makeElement("div", "controls");
  actions.append(printBtn);

  item.append(details, makeElement("p", "history-meta", when), actions);
  return item;
}

function renderPastBills() {
  const bills = loadBills();
  billsList.replaceChildren(...bills.map(createPastBillItem));
  billsEmpty.hidden = bills.length > 0;
}

// Fills the hidden receipt with one bill, then opens the browser's print
// dialog. The @media print rules in style.css show only the receipt.
function printReceipt(bill) {
  const table = document.createElement("table");

  bill.items.forEach((line) => {
    const row = document.createElement("tr");
    row.append(
      makeElement("td", "", `${line.qty} × ${line.name}`),
      makeElement("td", "receipt-amount", formatPrice(line.price * line.qty))
    );
    // Second, smaller row: the price of one unit
    const unitRow = document.createElement("tr");
    unitRow.append(makeElement("td", "receipt-unit", `@ ${formatPrice(line.price)}`), makeElement("td", ""));
    table.append(row, unitRow);
  });

  const totalRow = makeElement("tr", "receipt-total");
  totalRow.append(
    makeElement("td", "", "TOTAL"),
    makeElement("td", "receipt-amount", formatPrice(bill.total))
  );
  table.append(totalRow);

  receipt.replaceChildren(
    makeElement("h1", "", shopNameBtn.textContent),
    makeElement("p", "", `Bill #${bill.number}`),
    makeElement("p", "", new Date(bill.timestamp).toLocaleString()),
    table,
    makeElement("p", "", "Thank you")
  );

  window.print();
}

renderPastBills();

// Every finished bill as one spreadsheet file
document.getElementById("export-bills-btn").addEventListener("click", () => {
  const bills = loadBills();
  if (bills.length === 0) {
    alert("There are no finished bills to export yet.");
    return;
  }
  downloadBillsCsv(bills);
});

// ---------------------------------------------------------------------------
// Shop name: shown in the sidebar and printed at the top of receipts
// ---------------------------------------------------------------------------

const SHOP_KEY = "shopName";
const shopNameBtn = document.getElementById("shop-name");

// Use the saved name if there is one, otherwise keep "ScanDesk" from the HTML
shopNameBtn.textContent = localStorage.getItem(SHOP_KEY) || shopNameBtn.textContent;

shopNameBtn.addEventListener("click", () => {
  const name = prompt("Shop name (shown here and on receipts):", shopNameBtn.textContent);
  if (name === null || name.trim() === "") return; // cancelled or left empty
  shopNameBtn.textContent = name.trim();
  localStorage.setItem(SHOP_KEY, name.trim());
});
