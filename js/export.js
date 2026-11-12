// Turn the scan history into a CSV file download.
// CSV = "comma-separated values": plain text, one line per row, commas
// between cells. Excel and Google Sheets open it as a table.

const HEADER = ["Name", "Scan Type", "Scanned Content", "Date", "Time"];

// Makes one value safe to put in a CSV cell.
function csvCell(value) {
  let text = String(value ?? "");

  // A cell starting with = + - or @ is run as a formula by Excel. Scanned
  // text comes from strangers, so a leading ' makes Excel treat it as text.
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }

  // Wrap in quotes so commas and line breaks inside the text do not split
  // the cell. A quote inside the text is written twice ("") by CSV rules.
  return `"${text.replaceAll('"', '""')}"`;
}

// Self-check, runs on every page load. A failed check prints to the Console.
console.assert(csvCell("abc") === '"abc"', "plain text is quoted");
console.assert(csvCell('say "hi", ok') === '"say ""hi"", ok"', "quotes are doubled");
console.assert(csvCell("=1+1") === `"'=1+1"`, "formula is neutralised");
console.assert(csvCell("4006381333931") === '"4006381333931"', "digits unchanged");
console.assert(csvCell(undefined) === '""', "missing value becomes empty cell");

// Builds the whole CSV text from a list of scans
export function historyToCsv(scans) {
  const rows = scans.map((scan) => {
    const when = new Date(scan.timestamp);
    return [
      scan.name,
      scan.type,
      scan.content,
      when.toLocaleDateString(),
      when.toLocaleTimeString(),
    ];
  });

  // \r\n is the line ending the CSV standard asks for
  return [HEADER, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

// A barcode is a long run of digits. Excel treats that as a number and shows
// 6922829569848 as 6.92283E+12. Writing it as ="6922829569848" tells Excel
// (and Google Sheets) to keep it as text, so every digit shows.
// Only used for digit-only values, so it cannot smuggle in a real formula.
function codeCell(code) {
  return /^\d{9,}$/.test(code) ? `"=""${code}"""` : csvCell(code);
}

console.assert(codeCell("6922829569848") === '"=""6922829569848"""', "long digits kept as text");
console.assert(codeCell("ITEM-1") === '"ITEM-1"', "other codes are normal cells");
console.assert(codeCell("=1+1") === `"'=1+1"`, "formula still neutralised");

const BILL_HEADER = ["Bill No", "Date", "Time", "Barcode", "Item", "Qty", "Price", "Subtotal"];

// Builds a bill-style table: one row per item, then a TOTAL row per bill.
// Prices are plain numbers (15000, not "Rp 15.000") so a spreadsheet can add them up.
export function billsToCsv(bills) {
  const lines = [BILL_HEADER.map(csvCell).join(",")];

  for (const bill of bills) {
    const when = new Date(bill.timestamp);
    const start = [bill.number, when.toLocaleDateString(), when.toLocaleTimeString()].map(csvCell);

    for (const item of bill.items) {
      const rest = [item.name, item.qty, item.price, item.price * item.qty].map(csvCell);
      lines.push([...start, codeCell(item.code), ...rest].join(","));
    }

    lines.push([...start, ...["", "TOTAL", "", "", bill.total].map(csvCell)].join(","));
  }

  return lines.join("\r\n");
}

export function downloadCsv(scans) {
  saveCsvFile(historyToCsv(scans), "scan-history");
}

export function downloadBillsCsv(bills) {
  saveCsvFile(billsToCsv(bills), "bills");
}

// Makes the browser save CSV text as a file named e.g. bills-2026-11-11.csv
function saveCsvFile(csvText, name) {
  // ﻿ is an invisible marker that tells Excel the file is UTF-8, so
  // accented letters and non-English text show correctly
  const blob = new Blob(["﻿", csvText], { type: "text/csv;charset=utf-8" });

  // A Blob is a file held in memory. To download it we point a temporary,
  // invisible link at it and click that link from code.
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url); // free the memory
}
