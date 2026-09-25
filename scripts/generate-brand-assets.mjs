import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Source geometry is intentionally plain SVG; no font or network is needed.
const output = path.resolve('public/brand');
await fs.mkdir(output, { recursive: true });
const ink = '#101714';
const warm = '#f0f0e8';
const accent = '#d6ed8b';
const aperture = 'M5 5H27V11H11V19H5Z M27 27H5V21H21V13H27Z';
const lettering = [
  'M0 30V2H5L20 22V2H25V30H20L5 10V30Z',
  'M34 2H39V30H34Z',
  'M47 2H52L61 23L70 2H75L63.5 30H58.5Z',
  'M83 30V2H96C103 2 108 5.5 108 11.5C108 16 105.5 19 101.5 20.3L110 30H103.5L95.5 21H88V30Z M88 6.5V16.5H95.5C100.5 16.5 103 15 103 11.5C103 8 100.5 6.5 95.5 6.5Z',
  'M115 30L126.5 2H132L143.5 30H138L135.5 23.5H123L120.5 30Z M125 19H133.5L129.25 8Z',
].join(' ');
const svg = (width, height, children, title) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}"><title>${title}</title>${children}</svg>\n`;
const mark = (fill) => `<path fill="${fill}" d="${aperture}"/>`;
const word = (fill) => `<path fill="${fill}" fill-rule="evenodd" d="${lettering}"/>`;
const write = (name, data) => fs.writeFile(path.join(output, name), data);

for (const [name, color] of [['on-dark', accent], ['on-light', ink], ['monochrome', 'currentColor']]) {
  await write(`mark-${name}.svg`, svg(32, 32, mark(color), 'NIVRA signal aperture'));
  await write(`wordmark-${name}.svg`, svg(144, 32, word(name === 'on-dark' ? warm : color), 'NIVRA'));
  await write(`logo-${name}.svg`, svg(204, 40, `<g transform="scale(1.25)">${mark(color)}</g><g transform="translate(54 4)">${word(name === 'on-dark' ? warm : color)}</g>`, 'NIVRA'));
}

// Full-bleed backgrounds are intentional. Platforms provide the outer mask.
const appIcon = svg(512, 512, `<rect width="512" height="512" fill="${ink}"/><g transform="translate(32 32) scale(14)">${mark(accent)}</g>`, 'NIVRA app icon');
// Visible bounds 124..388; each corner fits within the central radius-204.8 safe circle.
const maskableIcon = svg(512, 512, `<rect width="512" height="512" fill="${ink}"/><g transform="translate(64 64) scale(12)">${mark(accent)}</g>`, 'NIVRA maskable app icon');
await write('app-icon.svg', appIcon);
await write('app-icon-maskable.svg', maskableIcon);
await sharp(Buffer.from(appIcon)).png().toFile('public/icon.png');
await sharp(Buffer.from(maskableIcon)).png().toFile(path.join(output, 'icon-maskable-512.png'));
await sharp(Buffer.from(appIcon)).resize(192, 192).png().toFile(path.join(output, 'icon-192.png'));
await sharp(Buffer.from(maskableIcon)).resize(180, 180).png().toFile(path.join(output, 'apple-touch-icon.png'));
await sharp(Buffer.from(svg(32, 32, mark('#ffffff'), 'NIVRA notification badge'))).resize(96, 96).png().toFile(path.join(output, 'notification-badge.png'));

const favicon = svg(32, 32, `<rect width="32" height="32" fill="${ink}"/>${mark(accent)}`, 'NIVRA');
await write('favicon.svg', favicon);
const iconImages = await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await sharp(Buffer.from(favicon)).resize(size, size).png().toBuffer() })));
const icoHeader = Buffer.alloc(6 + 16 * iconImages.length);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(iconImages.length, 4);
let offset = icoHeader.length;
for (let i = 0; i < iconImages.length; i++) {
  const { size, data } = iconImages[i];
  const entry = 6 + 16 * i;
  icoHeader[entry] = size;
  icoHeader[entry + 1] = size;
  icoHeader.writeUInt16LE(1, entry + 4);
  icoHeader.writeUInt16LE(32, entry + 6);
  icoHeader.writeUInt32LE(data.length, entry + 8);
  icoHeader.writeUInt32LE(offset, entry + 12);
  offset += data.length;
}
await fs.writeFile('src/app/favicon.ico', Buffer.concat([icoHeader, ...iconImages.map(({ data }) => data)]));

const board = svg(1320, 1000, `
<rect width="1320" height="1000" fill="${warm}"/>
<rect width="1320" height="370" fill="${ink}"/>
<g transform="translate(72 64) scale(1.4)">${mark(accent)}</g>
<g transform="translate(132 72) scale(1.05)">${word(warm)}</g>
<g font-family="Arial, sans-serif">
<text x="72" y="180" fill="${warm}" font-size="45" letter-spacing="-1">Understand the setup.</text>
<text x="72" y="238" fill="${warm}" font-size="45" letter-spacing="-1">See the risk. Decide with clarity.</text>
<text x="72" y="310" fill="#a4b0a8" font-size="18">IDENTITY STUDY / PROVISIONAL NAME / SEPTEMBER 2026</text>
<text x="72" y="432" fill="${ink}" font-size="13" letter-spacing="2">01 / SIGNAL APERTURE</text>
<text x="500" y="432" fill="${ink}" font-size="13" letter-spacing="2">02 / INTERVAL</text>
<text x="918" y="432" fill="${ink}" font-size="13" letter-spacing="2">03 / PARALLAX</text>
<g transform="translate(72 475) scale(4)">${mark(ink)}</g>
<g fill="${ink}" transform="translate(500 475) scale(4)"><path d="M4 5H25V11H4Z M9 14H28V20H9Z M4 23H25V29H4Z"/></g>
<g fill="none" stroke="${ink}" stroke-width="5" transform="translate(918 475) scale(4)"><path d="M14 5H5V27H14 M18 5H27V27H18"/><circle cx="16" cy="16" r="4" fill="${ink}" stroke="none"/></g>
<text x="72" y="652" fill="${ink}" font-size="22">Selected: an open reading field</text>
<text x="72" y="686" fill="#536257" font-size="17">Two opposed frames. Evidence in balance.</text>
<text x="72" y="712" fill="#536257" font-size="17">Clear at 16 px. Quiet, directional tension.</text>
<text x="500" y="652" fill="${ink}" font-size="22">Rhythm and sequence</text>
<text x="500" y="686" fill="#536257" font-size="17">Useful structure, but too close to a</text>
<text x="500" y="712" fill="#536257" font-size="17">generic menu or stacked data mark.</text>
<text x="918" y="652" fill="${ink}" font-size="22">Aligned viewpoints</text>
<text x="918" y="686" fill="#536257" font-size="17">Clear focus, but the central dot</text>
<text x="918" y="712" fill="#536257" font-size="17">becomes crowded at favicon sizes.</text>
<line x1="72" y1="765" x2="1248" y2="765" stroke="#ccd2c8"/>
<rect x="72" y="804" width="200" height="74" fill="${ink}"/>
<rect x="286" y="804" width="200" height="74" fill="${accent}"/>
<rect x="500" y="804" width="200" height="74" fill="#dce1d7"/>
<text x="72" y="908" fill="${ink}" font-size="15">INK / #101714</text>
<text x="286" y="908" fill="${ink}" font-size="15">CITRON / #D6ED8B</text>
<text x="500" y="908" fill="${ink}" font-size="15">WARM NEUTRALS</text>
<g transform="translate(850 825) scale(.5)">${mark(ink)}</g>
<g transform="translate(906 814)">${mark(ink)}</g>
<g transform="translate(978 798) scale(2)">${mark(ink)}</g>
<g transform="translate(1090 790) scale(2.75)">${mark(ink)}</g>
<text x="850" y="908" fill="${ink}" font-size="15">16 / 32 / 64 / 88 PX</text>
<text x="72" y="963" fill="#536257" font-size="14">Working identity only. Name conflicts found; trademark and launch-domain clearance remain outstanding.</text>
</g>`, 'NIVRA brand direction and three logo explorations');
await write('explorations.svg', board);
await sharp(Buffer.from(board)).resize(1320).png().toFile(path.join(output, 'explorations.png'));
console.log('Generated NIVRA vector assets, app icons, favicon, and exploration board.');
