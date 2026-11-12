// Save, load, search, rename and delete scans in LocalStorage.
// This file only handles data. Drawing the list on the page is app.js's job.
//
// One scan looks like:
//   { id, name, type, format, content, timestamp }

const STORAGE_KEY = "scanHistory";

// Returns all saved scans, newest first. Never throws: if nothing is saved,
// or the saved text is damaged, it returns an empty list.
export function loadHistory() {
  try {
    // LocalStorage holds text only, so the list is stored as JSON text
    const scans = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(scans) ? scans : [];
  } catch {
    return [];
  }
}

function saveHistory(scans) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scans));
}

export function addScan(scan) {
  // New scan goes first, then all the old ones
  saveHistory([scan, ...loadHistory()]);
}

export function deleteScan(id) {
  // Keep every scan except the one with this id
  saveHistory(loadHistory().filter((scan) => scan.id !== id));
}

export function renameScan(id, name) {
  // Copy every scan; the matching one gets the new name
  saveHistory(loadHistory().map((scan) => (scan.id === id ? { ...scan, name } : scan)));
}

export function clearHistory() {
  localStorage.removeItem(STORAGE_KEY);
}

// Returns the scans whose name, content, type or format contains the query.
// An empty query matches everything.
export function searchHistory(query) {
  const wanted = query.trim().toLowerCase();
  return loadHistory().filter((scan) =>
    [scan.name, scan.content, scan.type, scan.format].some((field) =>
      String(field ?? "").toLowerCase().includes(wanted)
    )
  );
}
