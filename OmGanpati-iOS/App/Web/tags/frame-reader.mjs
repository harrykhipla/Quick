// Keep decoding off the UI thread. A direct decoder also works in webviews
// that block module workers. The caller waits for one frame before taking another.
export function createFrameReader() {
  let worker;
  let pending;
  let closed = false;
  try {
    worker = new Worker(new URL("./reader-worker.mjs", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }) => {
      const frame = pending;
      pending = null;
      if (!frame) return;
      if (data.error) frame.reject(new Error(data.error));
      else frame.resolve(data.text);
    };
    worker.onerror = event => {
      event.preventDefault();
      worker.terminate();
      worker = null;
      const frame = pending;
      pending = null;
      if (frame) frame.reject(new Error("Worker unavailable"));
    };
  } catch {
    worker = null;
  }
  async function direct(context) {
    const { readSymbol } = await import("./read-symbol.mjs");
    if (closed) return null;
    return readSymbol(context.getImageData(0, 0, context.canvas.width, context.canvas.height));
  }
  return {
    async read(context) {
      if (closed) return null;
      if (!worker) return direct(context);
      const pixels = context.getImageData(0, 0, context.canvas.width, context.canvas.height);
      try {
        return await new Promise((resolve, reject) => {
          pending = { resolve, reject };
          worker.postMessage({ data: pixels.data, width: pixels.width, height: pixels.height }, [pixels.data.buffer]);
        });
      } catch (error) {
        pending = null;
        if (closed) return null;
        if (worker) throw error;
        return direct(context);
      }
    },
    close() {
      closed = true;
      worker?.terminate();
      pending?.resolve(null);
      pending = null;
    }
  };
}
