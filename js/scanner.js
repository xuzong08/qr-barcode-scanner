// Camera and image-file scanning. Wraps the html5-qrcode library, which
// index.html loads from a CDN and exposes as the global Html5Qrcode.
// This file knows nothing about buttons or the page layout: app.js calls
// these functions and decides what to show.

// id of the <div> in index.html where the library draws the camera video
const READER_ID = "reader";

// One scanner object is reused for the whole session
let scanner = null;

// Creates the scanner the first time it is needed. Doing this lazily (not at
// the top of the file) means the rest of the app still works if the library
// failed to download.
function getScanner() {
  if (typeof Html5Qrcode === "undefined") {
    throw new Error("LibraryMissing");
  }

  if (!scanner) {
    const formats = Html5QrcodeSupportedFormats;
    scanner = new Html5Qrcode(READER_ID, {
      // Only look for these code types. Fewer types = faster scanning.
      formatsToSupport: [
        formats.QR_CODE,
        formats.EAN_13,
        formats.EAN_8,
        formats.UPC_A,
        formats.UPC_E,
        formats.CODE_128,
        formats.CODE_39,
      ],
      verbose: false,
    });

    // The library switches the decoder's thorough mode ("TRY_HARDER", hint
    // number 3) off, with no option to turn it on. Thorough mode checks many
    // more lines of the picture, so a barcode that is tilted, blurry or not
    // in the middle still reads (measured: 4 failing cases all read with it).
    // shortcut: reaches into the library's internals, safe only because the
    // version is pinned to 2.3.8 in index.html. Re-check when upgrading.
    for (const decoder of [scanner.qrcode?.primaryDecoder, scanner.qrcode?.secondaryDecoder]) {
      decoder?.hints?.set(3, true);
    }
  }

  return scanner;
}

// Asks the browser for the list of cameras: [{ id, label }, ...].
// The first call makes the browser show its "Allow camera?" prompt.
export async function listCameras() {
  // Browsers only allow camera access on https:// pages and on localhost
  if (!window.isSecureContext) {
    throw new Error("InsecureContext");
  }
  getScanner(); // throws LibraryMissing if the library is not there
  return Html5Qrcode.getCameras();
}

// Why barcodes need this: the library does not decode the camera picture
// itself. It decodes a copy shrunk to the size the video has on screen, and
// in that small copy the thin bars of a barcode blur together (measured: an
// EAN-13 filling 40% of the frame fails at on-screen size, reads at 1280px).
// So while scanning, the reader is laid out 1280px wide, which makes the
// library decode a 1280px copy, and CSS zoom shrinks it to fit its frame.
const DECODE_WIDTH = 1280;

function fitReader() {
  const reader = document.getElementById(READER_ID);
  reader.style.zoom = reader.parentElement.clientWidth / DECODE_WIDTH;
  reader.style.width = `${DECODE_WIDTH}px`;
}

function resetReader() {
  window.removeEventListener("resize", fitReader);
  const reader = document.getElementById(READER_ID);
  reader.style.zoom = "";
  reader.style.width = "";
}

// How long a code must be out of the picture before it counts as a new scan
const SAME_CODE_GAP_MS = 1500;

// Starts the live camera and keeps it running. Calls onScan(content, format)
// each time a code comes into view. A code that simply stays in view is
// reported once, not ten times a second: to scan the same item twice, take
// it away and show it again.
// onFrame() is called for every picture that was checked and had no code.
export async function startCamera(cameraId, onScan, onFrame) {
  let lastContent = null;
  let lastSeen = 0;

  fitReader();
  window.addEventListener("resize", fitReader);

  try {
    await getScanner().start(
      cameraId,
      {
        fps: 10, // frames checked per second
        // Ask for a sharp picture. Without this, browsers give 640x480.
        // "ideal" means: as close as the camera can get, never an error.
        videoConstraints: {
          deviceId: { exact: cameraId },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        // No "qrbox" option on purpose: with a scan box the library only
        // decodes what is inside the box, so a code held close enough to
        // poke outside it was never read. Without it the whole picture is
        // scanned and the code can be anywhere.
      },
      (content, result) => {
        const stillInView = content === lastContent && Date.now() - lastSeen < SAME_CODE_GAP_MS;
        if (!stillInView) {
          onScan(content, result.result.format?.formatName ?? "UNKNOWN");
        }
        // Set after onScan: it may show pop-ups that take the user a while
        lastContent = content;
        lastSeen = Date.now();
      },
      () => {
        // Called for every frame that has no code in it
        onFrame();
      }
    );
  } catch (error) {
    resetReader(); // camera did not start: put the placeholder back to normal
    throw error;
  }
}

// Picture size the camera is really delivering, e.g. { width: 1280, height: 720 }
export function cameraResolution() {
  const { width, height } = scanner.getRunningTrackSettings();
  return { width, height };
}

// Turns the camera off and empties the reader <div>
export async function stopCamera() {
  if (scanner && scanner.isScanning) {
    await scanner.stop();
    scanner.clear();
    resetReader();
  }
}

// The image kinds the Upload view accepts (JPG and JPEG are both image/jpeg)
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Reads a code from an image file. Returns { content, format }.
// Throws if the file is not a supported image or holds no readable code.
export async function scanImage(file) {
  // The file picker's "accept" filter can be bypassed, so check here too
  if (!IMAGE_TYPES.includes(file.type)) {
    throw new Error("UnsupportedImage");
  }

  const fileScanner = getScanner();
  try {
    // false = do not draw the image into the reader <div>
    const result = await fileScanner.scanFileV2(file, false);
    return {
      content: result.decodedText,
      format: result.result.format?.formatName ?? "UNKNOWN",
    };
  } finally {
    // "finally" runs on success and on failure: remove the library's
    // hidden work canvas so the camera placeholder looks normal again
    fileScanner.clear();
  }
}

export function imageErrorMessage(error) {
  const text = String(error);

  if (text.includes("UnsupportedImage")) {
    return "That file type is not supported. Choose a JPG, PNG or WEBP image.";
  }
  if (text.includes("LibraryMissing")) {
    return "The scanning library did not load. Check your internet connection and reload the page.";
  }
  return "No QR code or barcode was found in this image. Try a sharper picture with the code larger in the frame.";
}

// Turns a technical camera error into a sentence a user can act on.
// The library reports some errors as text and some as Error objects, so we
// convert to text first and look for the browser's standard error names.
export function cameraErrorMessage(error) {
  const text = String(error);

  if (text.includes("InsecureContext")) {
    return "The camera only works on a secure page. Open the app from http://localhost or an https:// address.";
  }
  if (text.includes("LibraryMissing")) {
    return "The scanning library did not load. Check your internet connection and reload the page.";
  }
  if (text.includes("NotAllowedError")) {
    return "Camera permission was denied. Allow camera access in your browser's site settings, then press Start again.";
  }
  if (text.includes("NotFoundError")) {
    return "No camera was found on this device. You can scan an image with Upload instead.";
  }
  if (text.includes("NotReadableError")) {
    return "The camera is being used by another app. Close that app and press Start again.";
  }
  return `Could not start the camera. (${text})`;
}
