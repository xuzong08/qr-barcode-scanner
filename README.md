# QR & Barcode Scanner (ScanDesk)

A small cashier-style web app. It scans QR codes and barcodes with the camera
or from an image, remembers each product's name and price, builds a bill, and
prints a receipt. Plain HTML, CSS and JavaScript, no build step.

## Run it

You need Python 3 (any recent version).

```
python serve.py
```

Then open (https://xuzong08.github.io/qr-barcode-scanner/) in Chrome or Edge.

Do not open `index.html` by double-clicking it. The app uses JavaScript
modules and the camera, and browsers only allow both on `http://localhost` or
an `https://` address.

`serve.py` differs from `python -m http.server` in two ways: it tells the
browser not to cache, so a reload always runs your latest code, and it only
answers on your own computer.

## What it does

- **Camera scanner.** Start / Stop, camera picker, stays on between scans. An
  item held in view counts once; take it away and show it again to add another.
- **Upload.** Reads a code from a JPG, PNG or WEBP image.
- **Type a barcode.** A box in the Bill card for codes the camera cannot read.
- **Product memory.** The first time a code is seen, the app asks for a name
  and a price in Rupiah. After that it recognises the code.
- **Bill.** Quantity, price, subtotal, total. `−`, `+` and Edit per row.
- **Finish bill.** Saves the bill under Past bills with a number and date.
- **Receipt.** Print receipt on any past bill. Click the shop name in the
  sidebar to change what is printed at the top.
- **Export.** Past bills as a bill-style CSV; scan history as a CSV.
- **Scan history.** Every scan, with search, rename, delete, clear all.
- **Dark and light mode**, remembered between visits. Works on phone widths.

Supported codes: QR, EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39.

## Files

| File | Job |
|---|---|
| `index.html` | Page structure: sidebar, scanner, result, bill, past bills, history |
| `css/style.css` | Layout, light/dark colours, responsive rules, print rules for the receipt |
| `js/app.js` | Entry point. Listens for clicks, draws lists, calls the modules below |
| `js/scanner.js` | Camera and image scanning. The only file that talks to html5-qrcode |
| `js/history.js` | Scan history in LocalStorage |
| `js/products.js` | Product names and prices, Rupiah formatting |
| `js/bill.js` | Current bill and finished bills |
| `js/export.js` | CSV building and download |
| `serve.py` | Local development server |

Rule used throughout: data modules (`history`, `products`, `bill`, `export`)
never touch the page, and `app.js` never touches LocalStorage directly.

## Where data is kept

Everything is in the browser's LocalStorage for the address you opened.
Nothing is sent to a server.

| Key | Content |
|---|---|
| `scanHistory` | List of scans: `{ id, name, type, format, content, timestamp }` |
| `products` | `{ "<code>": { name, price } }` |
| `currentBill` | Bill in progress: `[{ code, name, price, qty }]` |
| `bills` | Finished bills: `[{ id, number, timestamp, items, total }]` |
| `shopName` | Name printed on receipts |
| `theme` | `light` or `dark` |

Data stays on this browser on this device. Another browser, another device, a
different port, or clearing site data all start empty. Export bills regularly
if they matter.

## Dependency

One: [html5-qrcode](https://github.com/mebjas/html5-qrcode) 2.3.8, loaded from
a CDN in `index.html` with a pinned version and an `integrity` hash. The app
needs an internet connection to load it.

`scanner.js` switches on the decoder's thorough mode through the library's
internals. That only works because the version is pinned. If you upgrade the
library, re-test barcode scanning and update the `integrity` hash.

## Known limits

- **Small barcodes on a laptop webcam.** Laptop webcams have fixed focus. A
  product barcode held close enough to be large is out of focus, and far
  enough to be sharp it is too small. QR codes are fine. Use the typed-barcode
  box, upload a phone photo, or use a phone camera or USB barcode scanner.
- **Glare and low contrast.** Shiny packaging and coloured bars may not read.
- **CSV has no column widths.** In Excel press Ctrl+A, then double-click a
  column border.
- **Copy button** only works on `localhost` or `https://`.
- **Using it on a phone** needs the app hosted on an `https://` address.
  Browsers refuse the camera on plain `http://` from another device.
- Switching cameras quickly can log `qrRegion undefined` in the Console. It
  comes from inside the library and is harmless.

## Self-checks

`app.js`, `export.js`, `products.js` and `bill.js` run a few `console.assert`
checks when the page loads (URL check, CSV escaping, price parsing, bill
total). Open the Console with F12: a failed check prints "Assertion failed".
No output means they passed.
