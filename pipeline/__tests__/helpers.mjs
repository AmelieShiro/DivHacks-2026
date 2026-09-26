/** Builders for minimal valid image headers, so tests need no binary fixtures. */
export function pngHeader(width, height) {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

export function gifHeader(width, height) {
  const b = Buffer.alloc(24);
  b.write("GIF89a", 0, "ascii");
  b.writeUInt16LE(width, 6);
  b.writeUInt16LE(height, 8);
  return b;
}

/** JPEG with an optional APP0 segment before the SOF0 frame header. */
export function jpegHeader(width, height, { withApp0 = true } = {}) {
  const parts = [Buffer.from([0xff, 0xd8])];
  if (withApp0) {
    const app0 = Buffer.alloc(18);
    app0.writeUInt16BE(0xffe0, 0);
    app0.writeUInt16BE(16, 2); // length covers itself
    app0.write("JFIF\0", 4, "ascii");
    parts.push(app0);
  }
  const sof = Buffer.alloc(11);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(8, 2);
  sof.writeUInt8(8, 4);
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  parts.push(sof, Buffer.alloc(16));
  return Buffer.concat(parts);
}

export function webpVp8xHeader(width, height) {
  const b = Buffer.alloc(32);
  b.write("RIFF", 0, "ascii");
  b.writeUInt32LE(24, 4);
  b.write("WEBP", 8, "ascii");
  b.write("VP8X", 12, "ascii");
  b.writeUIntLE(width - 1, 24, 3);
  b.writeUIntLE(height - 1, 27, 3);
  return b;
}

/** A page body shaped like what stage 20's verifier receives. */
export function page({ title = "", h1 = "", body = "" } = {}) {
  return `<html><head><title>${title}</title></head><body><h1>${h1}</h1><p>${body}</p></body></html>`;
}
