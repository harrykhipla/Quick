import { readSymbol } from "./read-symbol.mjs";

self.onmessage = ({ data }) => {
  try {
    self.postMessage({ text: readSymbol(data) });
  } catch {
    self.postMessage({ error: "The barcode reader could not process that image." });
  }
};
