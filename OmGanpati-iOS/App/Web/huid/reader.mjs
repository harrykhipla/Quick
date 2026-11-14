import { huidCandidates } from "./identity.mjs";

const byId = id => document.getElementById(id);
const asset = name => new URL("./ocr/" + name, import.meta.url).href;

function preparePhoto(image, bounds, enhance) {
  const source = bounds || { x: 0, y: 0, width: 1, height: 1 };
  const width = source.width * image.naturalWidth;
  const height = source.height * image.naturalHeight;
  const scale = Math.min(3, 2200 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, source.x * image.naturalWidth, source.y * image.naturalHeight,
    width, height, 0, 0, canvas.width, canvas.height);
  if (enhance) {
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const gray = (pixels.data[i] + 2 * pixels.data[i + 1] + pixels.data[i + 2]) / 4;
      const contrast = Math.max(0, Math.min(255, (gray - 128) * 1.8 + 128));
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = contrast;
    }
    ctx.putImageData(pixels, 0, 0);
  }
  return canvas;
}

export function setupHuidReader(onUse) {
  const dialog = byId("huid-dialog");
  const image = byId("huid-image");
  const box = byId("huid-image-box");
  const selection = byId("huid-selection");
  const panel = byId("huid-photo-panel");
  const feedback = byId("huid-scan-status");
  const candidates = byId("huid-candidates");
  let revision = 0;
  let worker;
  let timeout;
  let imageURL;
  let start;
  let crop;

  const current = run => run === revision && dialog.open;
  function cancelRead(keepLayout = false) {
    revision++;
    clearTimeout(timeout);
    worker?.terminate();
    worker = null;
    // Keep the centred dialog still while a crop is being drawn.
    if (keepLayout) {
      for (const button of candidates.children) button.disabled = true;
    } else candidates.replaceChildren();
    return revision;
  }
  function releasePhoto() {
    cancelRead();
    image.removeAttribute("src");
    if (imageURL) URL.revokeObjectURL(imageURL);
    imageURL = null;
    panel.hidden = true;
    selection.hidden = true;
    crop = null;
    start = null;
  }
  function showCandidates(codes, run) {
    feedback.textContent = codes.length
      ? "Check these characters against the engraving, then tap the matching code."
      : "No clear HUID found. Drag a box around the six characters, or take a closer photo in softer light.";
    for (const code of codes) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tag-action";
      button.textContent = "Use " + code;
      button.addEventListener("click", () => {
        if (!current(run)) return;
        onUse(code);
        dialog.close();
      });
      candidates.append(button);
    }
  }

  async function read(bounds = null) {
    const run = cancelRead();
    feedback.textContent = "Loading the text reader…";
    let localWorker;
    timeout = setTimeout(() => {
      if (!current(run)) return;
      cancelRead();
      feedback.textContent = "Reading took too long. Try a smaller crop or enter the HUID manually.";
    }, 60000);
    try {
      const { default: Tesseract } = await import("./ocr/tesseract.esm.min.js");
      if (!current(run)) return;
      localWorker = await Tesseract.createWorker("eng", Tesseract.OEM.LSTM_ONLY, {
        workerPath: asset("worker.min.js"),
        corePath: asset("tesseract-core-lstm.wasm.js"),
        langPath: asset("").replace(/\/$/, ""),
        workerBlobURL: false,
        gzip: true,
        cacheMethod: "none",
        logger(progress) {
          if (current(run) && progress.status === "recognizing text") {
            feedback.textContent = "Reading the engraving… " + Math.round(progress.progress * 100) + "%";
          }
        },
        errorHandler() {}
      }, { load_system_dawg: "0", load_freq_dawg: "0" });
      if (!current(run)) return;
      worker = localWorker;
      await localWorker.setParameters({
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
        tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT
      });
      let result = await localWorker.recognize(preparePhoto(image, bounds, false));
      if (!current(run)) return;
      let codes = huidCandidates(result.data.text);
      if (!codes.length) {
        await localWorker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE });
        result = await localWorker.recognize(preparePhoto(image, bounds, true));
        if (!current(run)) return;
        codes = huidCandidates(result.data.text);
      }
      showCandidates(codes, run);
    } catch {
      if (current(run)) feedback.textContent = "The text reader could not finish. Try another photo or enter the HUID manually.";
    } finally {
      await localWorker?.terminate();
      if (worker === localWorker) worker = null;
      if (current(run)) clearTimeout(timeout);
    }
  }

  async function loadPhoto(event) {
    const file = event.target.files[0];
    if (!file || !dialog.open) return;
    releasePhoto();
    const run = revision;
    if (file.size > 30 * 1024 * 1024) {
      feedback.textContent = "Choose a photo smaller than 30 MB.";
      return;
    }
    imageURL = URL.createObjectURL(file);
    image.src = imageURL;
    feedback.textContent = "Opening your photo…";
    try {
      await image.decode();
      if (!current(run)) return;
      if (image.naturalWidth * image.naturalHeight > 60000000) throw new Error("Image too large");
      panel.hidden = false;
      read();
    } catch {
      if (current(run)) feedback.textContent = "Could not open that image. Use a JPEG or PNG close-up.";
    }
  }
  byId("read-huid").addEventListener("click", () => {
    releasePhoto();
    feedback.textContent = "";
    dialog.showModal();
  });
  for (const [button, input] of [["huid-camera", "huid-capture"], ["huid-gallery", "huid-photo"]]) {
    byId(button).addEventListener("click", () => {
      cancelRead();
      feedback.textContent = "";
      byId(input).value = "";
      byId(input).click();
    });
    byId(input).addEventListener("change", loadPhoto);
  }
  byId("read-whole").addEventListener("click", () => {
    selection.hidden = true;
    crop = null;
    read();
  });
  function point(event) {
    const rect = box.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
    };
  }
  box.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    cancelRead(true);
    start = point(event);
    crop = null;
    selection.hidden = true;
    box.setPointerCapture(event.pointerId);
  });
  box.addEventListener("pointermove", event => {
    if (!start) return;
    const end = point(event);
    crop = {
      x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y)
    };
    selection.hidden = false;
    selection.style.left = crop.x * 100 + "%";
    selection.style.top = crop.y * 100 + "%";
    selection.style.width = crop.width * 100 + "%";
    selection.style.height = crop.height * 100 + "%";
  });
  box.addEventListener("pointerup", event => {
    if (!start) return;
    start = null;
    box.releasePointerCapture(event.pointerId);
    if (crop && crop.width * image.width > 12 && crop.height * image.height > 8) read(crop);
    else {
      selection.hidden = true;
      feedback.textContent = "Drag a box around all six characters, or tap Read whole photo.";
    }
  });
  box.addEventListener("pointercancel", () => {
    start = null;
    selection.hidden = true;
  });
  dialog.addEventListener("close", () => { if (!dialog.open) releasePhoto(); });
  window.addEventListener("pagehide", releasePhoto);
}
