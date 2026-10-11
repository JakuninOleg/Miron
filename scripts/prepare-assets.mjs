import sharp from "sharp";
import { mkdir } from "node:fs/promises";
await mkdir("public/characters", { recursive: true });
await mkdir("public/brand", { recursive: true });
for (const id of ["max", "lika"]) {
  const input = `concepts/miron-characters-2026-10-06/${id}-v1.png`;
  await sharp(input)
    .resize({ width: 768 })
    .webp({ quality: 85 })
    .toFile(`public/characters/${id}.webp`);
  await sharp(input)
    .extract({ left: 250, top: 45, width: 520, height: 520 })
    .resize(160)
    .webp({ quality: 85 })
    .toFile(`public/characters/${id}-avatar.webp`);
}
await sharp("public/icons/icon-512.png")
  .resize(160)
  .webp({ quality: 90 })
  .toFile("public/brand/mark.webp");
await sharp("assets/brand/miron/v2/miron-wordmark-light.png")
  .trim({ background: "#ffffff", threshold: 40 })
  .resize(500)
  .webp({ quality: 92 })
  .toFile("public/brand/wordmark.webp");
console.log("Existing MIRON artwork optimized; no character or technique changes.");
