// Use integer pixels per module and retain a white quiet zone in every file.
export async function writeSymbol(text, format) {
  const canvas = document.createElement("canvas");
  let widthMM, modules;
  if (format === "linear") {
    await import("./vendor/jsbarcode-code128-3.11.6.min.js");
    globalThis.JsBarcode(canvas, text, {
      format: "CODE128", width: 4, height: 152, margin: 40, marginTop: 16, marginBottom: 16,
      displayValue: false, background: "#ffffff", lineColor: "#000000"
    });
    widthMM = canvas.width / 4 * 0.32;
  } else {
    await import("./vendor/zxing-0.21.3.min.js");
    const Z = globalThis.ZXing;
    const hints = new Map([[Z.EncodeHintType.ERROR_CORRECTION, "Q"], [Z.EncodeHintType.MARGIN, 4]]);
    const matrix = new Z.QRCodeWriter().encode(text, Z.BarcodeFormat.QR_CODE, 0, 0, hints);
    modules = matrix.getWidth();
    const scale = 12;
    canvas.width = canvas.height = modules * scale;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000";
    for (let y = 0; y < modules; y++) {
      for (let x = 0; x < modules; x++) {
        if (matrix.get(x, y)) ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
    widthMM = modules * 0.625;
  }
  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("PNG encoding failed.");
  return { blob, modules, widthMM, heightMM: widthMM * canvas.height / canvas.width };
}
