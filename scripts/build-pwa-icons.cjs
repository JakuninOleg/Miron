// Mechanical platform exports of the generated master; no redraw or background removal.
// Install sharp locally, or set SHARP_MODULE to an existing sharp module directory.
const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require(process.env.SHARP_MODULE || "sharp");

const root = path.resolve(__dirname, "..");
const assetDir = path.join(root, "assets/brand/miron/pwa");
const publicDir = path.join(root, "public");
const master = path.join(assetDir, "icon-master.png");

async function main() {
  const { data, info } = await sharp(master)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== info.height) throw new Error("The icon master must be square.");
  let left = info.width,
    top = info.height,
    right = -1,
    bottom = -1;
  // For this white/pink master, the background is dark. Bounds only guide export framing.
  // The image pixels and the ribbon shading themselves are preserved.
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      if (Math.max(data[i], data[i + 1], data[i + 2]) > 80) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  if (right < left) throw new Error("No foreground found in icon master.");
  const width = right - left + 1,
    height = bottom - top + 1;
  const cx = (left + right) / 2,
    cy = (top + bottom) / 2;
  const round16 = (n) => Math.ceil(n / 16) * 16;
  const standardSide = round16(Math.max(width, height) / 0.78);
  // The entire foreground bounding rectangle fits inside radius 38%,
  // leaving extra room within the maskable guaranteed circle of radius 40%.
  const maskableSide = round16(Math.hypot(width, height) / 0.76);
  const region = (side) => {
    if (side > info.width) throw new Error("Master has insufficient padding.");
    return {
      left: Math.max(0, Math.min(info.width - side, Math.round(cx - side / 2))),
      top: Math.max(0, Math.min(info.height - side, Math.round(cy - side / 2))),
      width: side,
      height: side,
    };
  };
  await fs.mkdir(path.join(publicDir, "icons"), { recursive: true });
  const outputs = [
    ["favicon-16.png", 16, false],
    ["favicon-32.png", 32, false],
    ["favicon-48.png", 48, false],
    ["apple-touch-icon.png", 180, false],
    ["icons/apple-touch-icon-152.png", 152, false],
    ["icons/apple-touch-icon-167.png", 167, false],
    ["icons/icon-192.png", 192, false],
    ["icons/icon-512.png", 512, false],
    ["icons/icon-1024.png", 1024, false],
    ["icons/icon-maskable-192.png", 192, true],
    ["icons/icon-maskable-512.png", 512, true],
  ];
  for (const [file, size, maskable] of outputs) {
    await sharp(master)
      .extract(region(maskable ? maskableSide : standardSide))
      .resize(size, size, { kernel: "lanczos3" })
      .removeAlpha()
      .png({ compressionLevel: 9 })
      .toFile(path.join(publicDir, file));
  }

  // PNG-compressed frames in an ICO directory; supported by modern browsers/OSes.
  const sizes = [16, 32, 48];
  const frames = await Promise.all(
    sizes.map((n) => fs.readFile(path.join(publicDir, `favicon-${n}.png`))),
  );
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((n, i) => {
    const entry = 6 + 16 * i;
    header[entry] = n;
    header[entry + 1] = n;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(frames[i].length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += frames[i].length;
  });
  await fs.writeFile(path.join(publicDir, "favicon.ico"), Buffer.concat([header, ...frames]));

  const image = async (file) =>
    `data:image/png;base64,${(await fs.readFile(path.join(publicDir, file))).toString("base64")}`;
  const normal = await image("icons/icon-512.png");
  const maskable = await image("icons/icon-maskable-512.png");
  const apple = await image("apple-touch-icon.png");
  const tiny = await Promise.all(sizes.map((n) => image(`favicon-${n}.png`)));
  const preview = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="640" viewBox="0 0 1200 640">
    <defs><clipPath id="round"><rect x="350" y="120" width="200" height="200" rx="46"/></clipPath><clipPath id="circle"><circle cx="710" cy="220" r="100"/></clipPath><clipPath id="apple"><rect x="870" y="120" width="200" height="200" rx="46"/></clipPath></defs>
    <rect width="1200" height="640" fill="#F5F4F3"/>
    <g font-family="Arial, sans-serif" fill="#17181B"><text x="70" y="65" font-size="24" letter-spacing="3">MIRON / PWA</text>
    <image x="90" y="120" width="200" height="200" xlink:href="${normal}"/>
    <image x="350" y="120" width="200" height="200" clip-path="url(#round)" xlink:href="${maskable}"/>
    <image x="610" y="120" width="200" height="200" clip-path="url(#circle)" xlink:href="${maskable}"/>
    <image x="870" y="120" width="200" height="200" clip-path="url(#apple)" xlink:href="${apple}"/>
    <g font-size="17" text-anchor="middle"><text x="190" y="354">PWA 192 / 512</text><text x="450" y="354">Maskable</text><text x="710" y="354">Круглая маска</text><text x="970" y="354">Apple Touch Icon</text></g>
    <text x="90" y="432" font-size="20">Favicon — реальные размеры</text>
    <image x="95" y="474" width="16" height="16" xlink:href="${tiny[0]}"/>
    <image x="190" y="466" width="32" height="32" xlink:href="${tiny[1]}"/>
    <image x="290" y="458" width="48" height="48" xlink:href="${tiny[2]}"/>
    <g font-size="14"><text x="95" y="536">16 px</text><text x="190" y="536">32 px</text><text x="290" y="536">48 px</text></g>
    <text x="90" y="596" font-size="14" fill="#666">В экспортированных PNG углы квадратные. Маски показаны только для проверки.</text></g></svg>`;
  await sharp(Buffer.from(preview)).png().toFile(path.join(assetDir, "icons-preview.png"));
  const report = {
    master: { width: info.width, height: info.height },
    foregroundBounds: { left, top, right, bottom },
    standardCrop: region(standardSide),
    maskableCrop: region(maskableSide),
    maskableMaxBoundingRadiusRatio: Math.hypot(width, height) / (2 * maskableSide),
    files: outputs.map(([file, size, maskable]) => ({
      file: `public/${file}`,
      width: size,
      height: size,
      maskable,
    })),
    icoSizes: sizes,
  };
  await fs.writeFile(
    path.join(assetDir, "export-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    `Exported ${outputs.length} PNGs + favicon.ico. Maskable bounding radius: ${report.maskableMaxBoundingRadiusRatio.toFixed(3)} (< 0.4).`,
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
