import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];

const files = {
  index: 'apps/web/index.html',
  manifest: 'apps/web/public/manifest.webmanifest',
  svgIcon: 'apps/web/public/favicon.svg',
  icoIcon: 'apps/web/public/favicon.ico',
  appleIcon: 'apps/web/public/apple-touch-icon.png',
  icon192: 'apps/web/public/icons/icon-192.png',
  icon512: 'apps/web/public/icons/icon-512.png',
  brandMark: 'apps/web/public/brand/mark.svg',
};

for (const file of Object.values(files)) {
  if (!existsSync(join(root, file))) {
    failures.push(`Missing web asset: ${file}`);
  }
}

if (failures.length === 0) {
  const index = readText(files.index);
  requireFragments(files.index, index, [
    '<meta name="theme-color" content="#f7f8fb" />',
    '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />',
    '<link rel="icon" sizes="any" href="/favicon.ico" />',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
    '<link rel="manifest" href="/manifest.webmanifest" />',
    '<title>Runlane Console</title>',
  ]);

  const manifest = readJson(files.manifest);
  assertEqual(files.manifest, manifest.name, 'Runlane Console', 'name');
  assertEqual(files.manifest, manifest.short_name, 'Runlane', 'short_name');
  assertEqual(files.manifest, manifest.start_url, '/', 'start_url');
  assertEqual(files.manifest, manifest.scope, '/', 'scope');
  assertEqual(files.manifest, manifest.display, 'standalone', 'display');
  assertEqual(files.manifest, manifest.background_color, '#f7f8fb', 'background_color');
  assertEqual(files.manifest, manifest.theme_color, '#f7f8fb', 'theme_color');
  assertManifestIcon(manifest, '/icons/icon-192.png', '192x192');
  assertManifestIcon(manifest, '/icons/icon-512.png', '512x512');

  assertPngSize(files.appleIcon, 180, 180);
  assertPngSize(files.icon192, 192, 192);
  assertPngSize(files.icon512, 512, 512);
  assertIco(files.icoIcon);
  assertSvg(files.svgIcon);
  assertSvg(files.brandMark);
}

if (failures.length > 0) {
  console.error('Web asset validation failed');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Web asset validation completed');

function readText(file) {
  return readFileSync(join(root, file), 'utf8');
}

function readJson(file) {
  try {
    return JSON.parse(readText(file));
  } catch (error) {
    failures.push(`${file} must contain valid JSON: ${error.message}`);
    return {};
  }
}

function requireFragments(file, content, fragments) {
  for (const fragment of fragments) {
    if (!content.includes(fragment)) {
      failures.push(`${file} is missing fragment: ${fragment}`);
    }
  }
}

function assertEqual(file, actual, expected, field) {
  if (actual !== expected) {
    failures.push(`${file} field ${field} must be ${expected}`);
  }
}

function assertManifestIcon(manifest, src, sizes) {
  const icon = (manifest.icons ?? []).find((candidate) => candidate.src === src);

  if (!icon) {
    failures.push(`${files.manifest} is missing icon ${src}`);
    return;
  }

  if (icon.sizes !== sizes) {
    failures.push(`${files.manifest} icon ${src} must use ${sizes}`);
  }

  if (icon.type !== 'image/png') {
    failures.push(`${files.manifest} icon ${src} must use image/png`);
  }

  if (icon.purpose !== 'any maskable') {
    failures.push(`${files.manifest} icon ${src} must use any maskable`);
  }
}

function assertPngSize(file, expectedWidth, expectedHeight) {
  const buffer = readFileSync(join(root, file));
  const signature = buffer.subarray(0, 8).toString('hex');

  if (signature !== '89504e470d0a1a0a') {
    failures.push(`${file} must be a PNG file`);
    return;
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);

  if (width !== expectedWidth || height !== expectedHeight) {
    failures.push(`${file} must be ${expectedWidth}x${expectedHeight}`);
  }
}

function assertIco(file) {
  const buffer = readFileSync(join(root, file));

  if (buffer.length < 6 || buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) {
    failures.push(`${file} must be an ICO file`);
  }

  if (buffer.length >= 6 && buffer.readUInt16LE(4) < 1) {
    failures.push(`${file} must contain at least one icon image`);
  }
}

function assertSvg(file) {
  const content = readText(file);

  if (!content.includes('<svg') || !content.includes('viewBox')) {
    failures.push(`${file} must contain an SVG viewBox`);
  }
}
