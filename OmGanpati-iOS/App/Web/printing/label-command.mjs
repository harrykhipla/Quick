// POSIFLOW 58D official P58DLabelSetup driver selects T8DLabel, not the
// generic CAYSN page protocol. See docs/bluetooth-printing.md for provenance.
const word = n => [n & 255, (n >>> 8) & 255];
function integer(n, min, max, name) {
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Check ${name}.`);
}
function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
// T8D image conversion algorithm 1: each scanline is US ( P, payload length,
// followed by either 0 + literal bytes or RLE byte-count + (value, repeat) pairs.
export function encodeScanline(row) {
  const runs = [];
  for (let i = 0; i < row.length;) {
    const value = row[i]; let count = 1;
    while (i + count < row.length && row[i + count] === value && count < 255) count++;
    runs.push(value, count); i += count;
  }
  const payload = runs.length < row.length ? [runs.length, ...runs] : [0, ...row];
  return Uint8Array.from([0x1f, 0x28, 0x50, ...word(payload.length), ...payload]);
}
export function labelJob({data, width, height, x = 0, copies = 1}) {
  integer(width, 1, 384, 'label width');
  integer(height, 1, 1600, 'label length');
  integer(x, 0, 384 - width, 'label alignment');
  integer(copies, 1, 10, 'number of copies');
  const rowBytes = Math.ceil(width / 8);
  if (!(data instanceof Uint8Array) || data.length !== rowBytes * height) throw new Error('The label image is incomplete.');
  const parts = [Uint8Array.of(0x1b, 0x40, 0x1a, 0x0c, 0xff)];
  for (let y = 0; y < height; y++) {
    // Full 384-dot row, including bit-accurate positioning at e.g. x = 132.
    const row = new Uint8Array(48);
    for (let col = 0; col < width; col++) {
      if (data[y * rowBytes + (col >> 3)] & (0x80 >> (col & 7))) {
        const target = x + col;
        row[target >> 3] |= 0x80 >> (target & 7);
      }
    }
    parts.push(encodeScanline(row));
  }
  // The driver's label feed commands: back to print position, then tear edge.
  parts.push(Uint8Array.of(0x1a, 0x0c, 0x00));
  const page = concat(parts);
  return concat(Array.from({length: copies}, () => page));
}
// Feed to the next label edge; this does not recalibrate the gap sensor.
export const calibrationJob = () => Uint8Array.of(0x1a, 0x0c, 0x00);
export function labelSetJob(rasters, {x = 0, copies = 1} = {}) {
  integer(copies, 1, 10, 'number of copies');
  if (!Array.isArray(rasters) || !rasters.length || rasters.length > 8) throw new Error('Check the label pages.');
  const pages = rasters.map(raster => labelJob({...raster, x, copies:1}));
  return concat(Array.from({length:copies}, () => pages).flat());
}
// A tiny 12 × 8 mm image works on either the narrow jewellery stock or a
// rectangular test label. It deliberately avoids sending a full tag first.
export function printerCheckJob() {
  const width = 96, height = 64, data = new Uint8Array(12 * height);
  const dot = (x,y) => { data[y * 12 + (x >> 3)] |= 0x80 >> (x & 7); };
  for (let y=0;y<height;y++) for(let x=0;x<width;x++) {
    if (x<2 || x>=width-2 || y<2 || y>=height-2) dot(x,y);
  }
  const glyphs = ['01110100011000110001100011000101110','10001100101010011000101001001010001'];
  glyphs.forEach((glyph,g) => {
    for(let y=0;y<7;y++) for(let x=0;x<5;x++) if(glyph[y*5+x]==='1') {
      for(let dy=0;dy<5;dy++) for(let dx=0;dx<5;dx++) dot(18+g*31+x*5+dx,14+y*5+dy);
    }
  });
  return labelJob({data,width,height,x:144});
}

export function packPixels(rgba, width, height) {
  if (rgba.length !== width * height * 4) throw new Error('The label image is incomplete.');
  const rowBytes = Math.ceil(width / 8);
  const out = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const alpha = rgba[i + 3] / 255;
    const brightness = (rgba[i] * .2126 + rgba[i + 1] * .7152 + rgba[i + 2] * .0722) * alpha + 255 * (1 - alpha);
    if (brightness < 160) out[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
  }
  return out;
}

// Rotate only the long, narrow jewellery stock. Rectangular stickers stay
// horizontal; crop only the deliberately blank 5 mm paper margins.
export function orientLabelRaster({data,width,height},{format='rectangle',reverse=false}={}) {
  const strip=format==='label';
  if(!strip && format!=='rectangle') throw new Error('Choose a label format for direct printing.');
  if(strip ? width!==800 || height!==120 : width!==464 || height<160 || height>800 || height%8!==0) {
    throw new Error('The label image does not match the selected paper size.');
  }
  const sourceStride=Math.ceil(width/8);
  if(!(data instanceof Uint8Array) || data.length!==sourceStride*height) throw new Error('The label image is incomplete.');
  const w=strip?120:384,h=strip?800:height,stride=Math.ceil(w/8),out=new Uint8Array(stride*h);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const sx=strip?(reverse?799-y:y):(reverse?423-x:x+40);
    const sy=strip?(reverse?x:119-x):(reverse?height-1-y:y);
    if(data[sy*sourceStride+(sx>>3)]&(128>>(sx&7))) out[y*stride+(x>>3)]|=128>>(x&7);
  }
  return {width:w,height:h,data:out};
}

export async function rasterizeLabel(blob, options = {}) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0);
    return orientLabelRaster({width:canvas.width,height:canvas.height,
      data:packPixels(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height)},options);
  } finally { URL.revokeObjectURL(url); }
}
