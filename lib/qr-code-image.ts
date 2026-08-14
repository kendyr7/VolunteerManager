import { deflateSync } from 'node:zlib';
import qrcode from 'qrcode-generator';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

export function createQrPngBuffer(
  value: string,
  options: { scale?: number; marginModules?: number } = {},
): Buffer {
  const scale = Math.max(4, Math.min(options.scale ?? 8, 16));
  const marginModules = Math.max(4, options.marginModules ?? 4);
  const qr = qrcode(0, 'H');
  qr.addData(value, 'Byte');
  qr.make();

  const moduleCount = qr.getModuleCount();
  const imageSize = (moduleCount + marginModules * 2) * scale;
  const stride = imageSize * 4 + 1;
  const pixels = Buffer.alloc(stride * imageSize, 255);

  for (let y = 0; y < imageSize; y += 1) {
    const rowOffset = y * stride;
    pixels[rowOffset] = 0;
    for (let x = 0; x < imageSize; x += 1) {
      const moduleX = Math.floor(x / scale) - marginModules;
      const moduleY = Math.floor(y / scale) - marginModules;
      const isDark = moduleX >= 0
        && moduleY >= 0
        && moduleX < moduleCount
        && moduleY < moduleCount
        && qr.isDark(moduleY, moduleX);
      const color = isDark ? 13 : 255;
      const pixelOffset = rowOffset + 1 + x * 4;
      pixels[pixelOffset] = color;
      pixels[pixelOffset + 1] = isDark ? 17 : 255;
      pixels[pixelOffset + 2] = isDark ? 23 : 255;
      pixels[pixelOffset + 3] = 255;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(imageSize, 0);
  header.writeUInt32BE(imageSize, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
