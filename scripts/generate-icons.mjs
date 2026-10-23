// Renders the PagePace mark to the PNG icons the manifest and iOS need.
// Run with: node scripts/generate-icons.mjs
import { writeFile } from "node:fs/promises";
import sharp from "sharp";

const mark = ({ rounded }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" ${rounded ? 'rx="116"' : ""} fill="#141412"/>
  <circle cx="256" cy="256" r="150" fill="none" stroke="#ffffff" stroke-opacity="0.13" stroke-width="40"/>
  <path d="M256 106A150 150 0 1 1 106 256" fill="none" stroke="#ff7b48" stroke-width="40" stroke-linecap="round"/>
  <circle cx="256" cy="256" r="28" fill="#f2f1ed"/>
</svg>`;

const outputs = [
  ["public/icons/icon-192.png", 192, true],
  ["public/icons/icon-512.png", 512, true],
  ["public/icons/maskable-512.png", 512, false],
  ["app/apple-icon.png", 180, false],
];

for (const [file, size, rounded] of outputs) {
  await sharp(Buffer.from(mark({ rounded }))).resize(size, size).png().toFile(file);
}
await writeFile("app/icon.svg", mark({ rounded: true }));
console.log("icons written");
