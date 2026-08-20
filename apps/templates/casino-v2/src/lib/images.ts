const rasterPattern = /\.(png|jpe?g|webp)$/i;

export function isLocalRasterImage(src: string | undefined) {
  return Boolean(src && src.startsWith("/") && rasterPattern.test(src));
}

export function getWebpSrc(src: string) {
  return src.replace(/\.(png|jpe?g|webp)$/i, ".webp");
}

export function getResponsiveWebpSrcset(src: string, widths = [320, 640, 960, 1280]) {
  if (!isLocalRasterImage(src)) return undefined;

  const webp = getWebpSrc(src);
  const extensionIndex = webp.lastIndexOf(".");
  const base = webp.slice(0, extensionIndex);
  const extension = webp.slice(extensionIndex);

  return [
    ...widths.map((width) => `${base}-${width}${extension} ${width}w`),
    `${webp} 1600w`,
  ].join(", ");
}
