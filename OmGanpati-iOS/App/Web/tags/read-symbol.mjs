import "./vendor/zxing-0.21.3.min.js";

const Z = globalThis.ZXing;
const reader = new Z.MultiFormatReader();
reader.setHints(new Map([
  [Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.QR_CODE, Z.BarcodeFormat.CODE_128]],
  [Z.DecodeHintType.TRY_HARDER, true]
]));

function read(gray, width, height) {
  const source = new Z.RGBLuminanceSource(gray, width, height);
  const bitmap = new Z.BinaryBitmap(new Z.HybridBinarizer(source));
  try {
    return reader.decodeWithState(bitmap).getText();
  } catch (error) {
    if (error instanceof Z.NotFoundException || error instanceof Z.ChecksumException || error instanceof Z.FormatException) return null;
    throw error;
  } finally {
    reader.reset();
  }
}

export function readSymbol({ data, width, height }) {
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
    gray[i] = (data[j] + 2 * data[j + 1] + data[j + 2]) >> 2;
  }
  const text = read(gray, width, height);
  if (text !== null) return text;
  // The 1-D reader searches horizontal scanlines. Also cover tags held vertically.
  const rotated = new Uint8ClampedArray(gray.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) rotated[x * height + height - 1 - y] = gray[y * width + x];
  }
  return read(rotated, height, width);
}
