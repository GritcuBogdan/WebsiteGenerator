// Minimal ICO (ICONDIR) encoder. Since Windows Vista, ICO entries may embed
// a complete PNG file instead of a raw BMP bitmap, and every current
// browser/OS reads that format — so favicon.ico here is just a small
// header wrapping the PNG buffers sharp already produced, no BMP encoding
// needed and no extra dependency.
export type IcoImage = {
  size: number; // square side length in px; 256 is encoded as 0 per the ICO spec
  png: Buffer;
};

const HEADER_SIZE = 6;
const ENTRY_SIZE = 16;

export function encodeIco(images: IcoImage[]): Buffer {
  const count = images.length;
  const dirSize = HEADER_SIZE + ENTRY_SIZE * count;

  const header = Buffer.alloc(HEADER_SIZE);
  header.writeUInt16LE(0, 0); // reserved, must be 0
  header.writeUInt16LE(1, 2); // image type: 1 = icon
  header.writeUInt16LE(count, 4);

  const entries: Buffer[] = [];
  let offset = dirSize;

  for (const { size, png } of images) {
    const entry = Buffer.alloc(ENTRY_SIZE);
    const dimensionByte = size >= 256 ? 0 : size;
    entry.writeUInt8(dimensionByte, 0); // width
    entry.writeUInt8(dimensionByte, 1); // height
    entry.writeUInt8(0, 2); // color palette size, 0 = no palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8); // image data size
    entry.writeUInt32LE(offset, 12); // offset from start of file
    entries.push(entry);
    offset += png.length;
  }

  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)]);
}
