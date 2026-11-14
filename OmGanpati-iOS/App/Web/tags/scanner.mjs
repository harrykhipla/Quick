import { createFrameReader } from "./frame-reader.mjs";

const byId = id => document.getElementById(id);
const fullImage = image => ({ x: 0, y: 0, w: image.naturalWidth, h: image.naturalHeight });

function videoBounds(video) {
  const w = video.videoWidth;
  const h = video.videoHeight;
  const aspect = video.clientWidth / video.clientHeight;
  const cropW = Math.min(w, h * aspect);
  const cropH = Math.min(h, w / aspect);
  return { x: (w - cropW) / 2, y: (h - cropH) / 2, w: cropW, h: cropH };
}

// Composite on white so transparent PNGs, letterboxing and rotated corners
// preserve the light background a physical barcode is printed on.
function capture(context, source, bounds, maxSide, degrees = 0) {
  const scale = Math.min(1, maxSide / Math.max(bounds.w, bounds.h));
  const w = Math.max(1, Math.round(bounds.w * scale));
  const h = Math.max(1, Math.round(bounds.h * scale));
  const angle = degrees * Math.PI / 180;
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const cw = Math.ceil(w * cos + h * sin);
  const ch = Math.ceil(h * cos + w * sin);
  const canvas = context.canvas;
  if (canvas.width !== cw) canvas.width = cw;
  if (canvas.height !== ch) canvas.height = ch;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, cw, ch);
  context.save();
  context.translate(cw / 2, ch / 2);
  context.rotate(angle);
  context.drawImage(source, bounds.x, bounds.y, bounds.w, bounds.h, -w / 2, -h / 2, w, h);
  context.restore();
}

function cameraMessage(error) {
  if (error.name === "NotAllowedError" || error.name === "SecurityError") {
    return "Allow camera access in your browser, or choose a barcode photo. On iPhone you can also open the calculator in Safari.";
  }
  if (error.name === "NotFoundError") return "No camera was found. Choose a barcode photo or use a handheld scanner.";
  if (error.name === "NotReadableError") return "The camera is busy. Close the other camera app and try again.";
  return "The camera could not start. Try again or choose a barcode photo.";
}

export function setupScanner(applyCode, readDetails) {
  const dialog = byId("scan-dialog");
  const video = byId("tag-video");
  const start = byId("start-camera");
  const stop = byId("stop-camera");
  const sample = byId("scan-sample");
  const file = byId("barcode-photo");
  const entry = byId("handheld-code");
  const feedback = byId("scan-feedback");
  const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  let continuous = false;
  let revision = 0;
  let stream;
  let reader;
  let timer;
  let audio;
  function enableSound() {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (Audio) {
        audio ??= new Audio();
        audio.resume().catch(() => {});
      }
    } catch { /* Visual feedback remains available. */ }
  }
  function signalRead() {
    try { navigator.vibrate?.(60); } catch {}
    if (audio?.state !== "running") return;
    try {
      const tone = audio.createOscillator(), gain = audio.createGain();
      const now = audio.currentTime;
      tone.frequency.value = 990;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.14, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      tone.connect(gain); gain.connect(audio.destination);
      tone.onended = () => { tone.disconnect(); gain.disconnect(); };
      tone.start(now); tone.stop(now + 0.11);
    } catch {}
  }

  function message(text, error = false) {
    if (feedback.textContent !== text) feedback.textContent = text;
    feedback.dataset.error = String(error);
  }
  function endWork() {
    revision++;
    clearTimeout(timer);
    reader?.close();
    reader = null;
    if (stream) stream.getTracks().forEach(track => track.stop());
    stream = null;
    video.pause();
    video.srcObject = null;
    video.hidden = true;
    start.hidden = false;
    start.disabled = false;
    start.textContent = "Start camera";
    stop.hidden = true;
    sample.hidden = false;
    return revision;
  }
  const current = run => run === revision && dialog.open;

  function accept(code, source) {
    try {
      if (continuous) {
        const { name, rows } = readDetails(code);
        const details = document.createDocumentFragment();
        for (const [label, value] of rows) {
          const term = document.createElement("dt");
          const description = document.createElement("dd");
          term.textContent = label;
          description.textContent = value;
          details.append(term, description);
        }
        byId("readout-name").textContent = name;
        byId("readout-details").replaceChildren(details);
      } else {
        applyCode(code, source);
      }
    } catch (error) {
      message(error.message, true);
      return false;
    }
    if (source !== "sample") signalRead();
    if (continuous) {
      message(source === "camera" ? "Tag read. Ready for the next piece." : "Tag read.");
      entry.value = "";
      return true;
    }
    endWork();
    dialog.close();
    const summary = byId("price-summary");
    summary.focus({preventScroll: true});
    summary.scrollIntoView({block: "start"});
    return true;
  }

  async function startCamera() {
    enableSound();
    const run = endWork();
    if (!navigator.mediaDevices?.getUserMedia) {
      message("Open the calculator in your browser for camera access, or choose a barcode photo.", true);
      return;
    }
    start.textContent = "Starting…";
    start.disabled = true;
    sample.hidden = true;
    stop.hidden = false;
    message("Allow camera access when prompted.");
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      if (!current(run)) {
        acquired.getTracks().forEach(track => track.stop());
        return;
      }
      stream = acquired;
      const track = stream.getVideoTracks()[0];
      track.addEventListener("ended", () => {
        if (!current(run)) return;
        endWork();
        message("Camera stopped. Tap Start camera to resume.");
      }, { once: true });
      video.hidden = false;
      video.srcObject = stream;
      await video.play();
      if (!current(run)) return;
      start.hidden = true;
      reader = createFrameReader();
      message("Hold the whole code steady, including its white border.");
    } catch (error) {
      if (current(run)) { endWork(); message(cameraMessage(error), true); }
      return;
    }
    let frames = 0, lastCode = null, missingSince = null;
    async function tick() {
      if (!current(run)) return;
      try {
        if (video.readyState >= 2 && video.videoWidth && video.clientHeight) {
          const angle = [0, 0, 0, 22, 0, -22, 0, 45][frames++ % 8];
          capture(context, video, videoBounds(video), 1440, angle);
          const code = await reader.read(context);
          if (!current(run)) return;
          if (code === null) {
            missingSince ??= performance.now();
            if (performance.now() - missingSince >= 1200) lastCode = null;
          } else {
            missingSince = null;
            if (code !== lastCode) {
              lastCode = code;
              if (accept(code, "camera") && !continuous) return;
            }
          }
        }
      } catch {
        if (current(run)) {
          endWork();
          message("The live reader stopped. Try again or choose a photo.", true);
        }
        return;
      }
      if (current(run)) timer = setTimeout(tick, 150);
    }
    tick();
  }

  async function scanImage(url, source) {
    const run = endWork();
    let localReader;
    message("Reading the barcode image…");
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (!current(run)) return;
      const bounds = fullImage(image);
      localReader = reader = createFrameReader();
      const attempts = [[1500, 0], [2400, 0], [1100, 22], [1100, -22], [1100, 45]];
      const tried = new Set();
      for (const [limit, angle] of attempts) {
        const size = Math.min(limit, Math.max(bounds.w, bounds.h));
        const key = size + "/" + angle;
        if (tried.has(key)) continue;
        tried.add(key);
        capture(context, image, bounds, limit, angle);
        const code = await localReader.read(context);
        if (!current(run)) return;
        if (code !== null) {
          accept(code, source);
          return;
        }
      }
      message("No barcode found. Crop closer, keep the whole symbol and its white border, then try again.", true);
    } catch {
      if (current(run)) message("Could not read that image. Try a clear JPEG or PNG of one tag.", true);
    } finally {
      localReader?.close();
      if (reader === localReader) reader = null;
    }
  }

  window.applyNativeTag = code => {
    if (continuous) {
      const {name,rows} = readDetails(code);
      return [name,...rows.map(([label,value]) => label + ": " + value)].join("\n");
    }
    applyCode(code,"camera");
    const summary = byId("price-summary");
    summary.focus({preventScroll:true});
    summary.scrollIntoView({block:"start"});
    return byId("item-name").value || "Jewellery";
  };
  const intro = dialog.querySelector(".tag-intro");
  const originalIntro = intro.textContent;
  async function openScanner(repeat) {
    continuous = repeat;
    byId("scan-title").textContent = repeat ? "Continuous scan" : "Scan jewellery tag";
    intro.textContent = repeat ? "Hold each tag in view. Its details appear below the camera." : originalIntro;
    byId("scan-readout").hidden = !repeat;
    byId("readout-name").textContent = "Waiting for a tag";
    byId("readout-details").replaceChildren();
    endWork();
    message("");
    entry.value = "";
    byId("handheld-details").open = false;
    try {
      await window.webkit.messageHandlers.printer.postMessage({op:"scan",continuous:repeat});
    } catch (error) {
      dialog.showModal();
      message(error.message || "Camera unavailable. Choose a barcode photo.",true);
    }
  }
  byId("open-scanner").addEventListener("click", () => openScanner(false));
  byId("open-continuous").addEventListener("click", () => openScanner(true));
  start.addEventListener("click", startCamera);
  stop.addEventListener("click", () => { endWork(); message("Camera stopped."); });
  sample.addEventListener("click", () => scanImage(new URL("./sample-22k.png", import.meta.url).href, "sample"));
  byId("pick-photo").addEventListener("click", () => {
    endWork();
    message("");
    file.value = "";
    file.click();
  });
  file.addEventListener("change", async () => {
    const photo = file.files[0];
    if (!photo || !dialog.open) return;
    if (photo.size > 40 * 1024 * 1024) { message("Choose a barcode image smaller than 40 MB.", true); return; }
    const url = URL.createObjectURL(photo);
    try { await scanImage(url, "photo"); }
    finally { URL.revokeObjectURL(url); }
  });
  byId("handheld-details").addEventListener("toggle", event => {
    if (event.target.open && dialog.open) { endWork(); message(""); entry.focus(); }
  });
  byId("handheld-form").addEventListener("submit", event => {
    event.preventDefault();
    if (!accept(entry.value, "handheld")) entry.select();
  });
  dialog.addEventListener("close", () => { if (!dialog.open) endWork(); });
  dialog.addEventListener("cancel", endWork);
  window.addEventListener("pagehide", endWork);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && dialog.open && (!stop.hidden || stream)) {
      endWork();
      message("Camera paused. Tap Start camera to resume.");
    }
  });
}
