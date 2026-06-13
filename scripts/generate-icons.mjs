import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const sizes = [192, 512];
const outDir = 'C:/Users/Inmov/Downloads/financeos-app/icons';
mkdirSync(outDir, { recursive: true });

// SVG icon: rounded square with gradient background + "F" letter
const svgBg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#4f46e5"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size*0.2}" fill="url(#g)"/>
  <text x="${size/2}" y="${size*0.68}" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800" font-size="${size*0.55}" fill="white">F</text>
</svg>`;

for (const size of sizes) {
  const svg = svgBg(size);
  const svgPath = join(outDir, `icon-${size}.svg`);
  writeFileSync(svgPath, svg);
  
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(join(outDir, `icon-${size}.png`));
  
  console.log(`Created icon-${size}.png (${size}x${size})`);
}

// Also create a favicon 32x32
const fav32 = svgBg(32);
writeFileSync(join(outDir, 'favicon.svg'), fav32);
await sharp(Buffer.from(fav32))
  .resize(32, 32)
  .png()
  .toFile(join(outDir, 'favicon.png'));
console.log('Created favicon.png (32x32)');

console.log('Done!');
