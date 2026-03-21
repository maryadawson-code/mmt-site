#!/usr/bin/env node
// Convert PNG/JPG images to WebP using sharp (already a project dependency)

const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const dir = path.resolve(__dirname, "..");
const images = [
  "fed-up-logo.png",
  "marywomack.jpg",
  "sarabyrd.jpg",
  "MMT_logo_primary_transparent.png",
  "mmt-logo-nav.png",
  "mmt-logo.png",
  "MMT_icon_128px.png",
  "hero-logo.png",
  "mmt-icon.png",
  "apple-touch-icon.png",
  "favicon.png",
];

async function convert() {
  const results = [];
  for (const img of images) {
    const src = path.join(dir, img);
    if (!fs.existsSync(src)) {
      console.log(`SKIP: ${img}`);
      continue;
    }
    const ext = path.extname(img);
    const base = img.replace(ext, "");
    const dst = path.join(dir, `${base}.webp`);
    const origSize = fs.statSync(src).size;

    try {
      await sharp(src).webp({ quality: 80 }).toFile(dst);
      const newSize = fs.statSync(dst).size;
      const savings = origSize - newSize;
      const pct = ((savings / origSize) * 100).toFixed(1);
      results.push({ img, origSize, newSize, savings, pct });
      console.log(`${img}: ${origSize} → ${newSize} (${pct}% savings)`);
    } catch (err) {
      console.error(`FAIL: ${img}: ${err.message}`);
    }
  }

  const totalOrig = results.reduce((s, r) => s + r.origSize, 0);
  const totalNew = results.reduce((s, r) => s + r.newSize, 0);
  console.log(
    `\nTOTAL: ${totalOrig} → ${totalNew} (${(
      ((totalOrig - totalNew) / totalOrig) *
      100
    ).toFixed(1)}% savings)`
  );
}

convert().catch(console.error);
