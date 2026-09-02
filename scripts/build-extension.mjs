// Packs browser-extension/ into the zip the agents download from the app.
//
// Everything the extension needs is listed here by hand rather than globbed, so
// a stray file left in the folder cannot ride along into what people install —
// and so the manifest's own script list and this list can be compared at a
// glance. Run it whenever anything under browser-extension/ changes:
//
//   npm run build:ext
//
// It writes a flat zip (no wrapper folder), which is what chrome://extensions →
// "load unpacked" expects after extracting.

import { createWriteStream, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { deflateRawSync } from 'node:zlib'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'browser-extension')
const OUT = join(ROOT, 'public', 'ext', 'RES-BMBY.zip')

const FILES = [
  'manifest.json',
  'shared.js',
  'meetings.js',
  'dictate.js',
  // command.js — the voice assistant — is deliberately NOT packed. It is out at
  // the office's request; the file stays in the repo so restoring it means
  // adding it back here and to the manifest.
  'boot.js',
  'options.html',
  'options.js',
  // Double-click updater, so nobody has to download and unzip by hand. ASCII
  // filenames on purpose: these must survive any unzip tool and any locale, and
  // a mojibake name would make them undouble-clickable.
  'update.bat',
  'update.ps1',
  // Bundled so the panel renders in the brand's Rubik on any machine; zip
  // entries always use forward slashes, whatever the OS says.
  'fonts/rubik-hebrew.woff2',
  'fonts/rubik-latin.woff2',
]

// The manifest is the source of truth for which scripts actually run; if it
// names one that is not being packed, the zip would install and silently do
// nothing on the page.
const manifest = JSON.parse(readFileSync(join(SRC, 'manifest.json'), 'utf8'))
for (const script of manifest.content_scripts.flatMap((c) => c.js)) {
  if (!FILES.includes(script)) {
    throw new Error(`manifest lists ${script}, but it is not in FILES — add it and re-run.`)
  }
}

// Windows PowerShell 5.1 reads a BOM-less .ps1 as the system ANSI codepage,
// which turns the updater's Hebrew into nonsense on the machines it is meant to
// help. Cheap to assert here; confusing to diagnose in the field.
const ps1 = readFileSync(join(SRC, 'update.ps1'))
if (!(ps1[0] === 0xef && ps1[1] === 0xbb && ps1[2] === 0xbf)) {
  throw new Error('update.ps1 has lost its UTF-8 BOM — PowerShell 5.1 will mangle the Hebrew.')
}

// ── A minimal zip writer, so packaging needs no dependency ──────────────────
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const chunks = []
const central = []
let offset = 0
// A fixed timestamp (2020-01-01) keeps the zip byte-identical between builds
// when nothing changed, so git does not show noise on every run.
const DOS_TIME = 0
const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1

for (const name of FILES) {
  const data = readFileSync(join(SRC, name))
  const deflated = deflateRawSync(data, { level: 9 })
  const nameBuf = Buffer.from(name, 'utf8')
  const crc = crc32(data)

  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4) // version needed
  local.writeUInt16LE(0x0800, 6) // UTF-8 names
  local.writeUInt16LE(8, 8) // deflate
  local.writeUInt16LE(DOS_TIME, 10)
  local.writeUInt16LE(DOS_DATE, 12)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(deflated.length, 18)
  local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(nameBuf.length, 26)
  chunks.push(local, nameBuf, deflated)

  const entry = Buffer.alloc(46)
  entry.writeUInt32LE(0x02014b50, 0)
  entry.writeUInt16LE(20, 4)
  entry.writeUInt16LE(20, 6)
  entry.writeUInt16LE(0x0800, 8)
  entry.writeUInt16LE(8, 10)
  entry.writeUInt16LE(DOS_TIME, 12)
  entry.writeUInt16LE(DOS_DATE, 14)
  entry.writeUInt32LE(crc, 16)
  entry.writeUInt32LE(deflated.length, 20)
  entry.writeUInt32LE(data.length, 24)
  entry.writeUInt16LE(nameBuf.length, 28)
  entry.writeUInt32LE(offset, 42)
  central.push(entry, nameBuf)

  offset += local.length + nameBuf.length + deflated.length
}

const centralBuf = Buffer.concat(central)
const end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0)
end.writeUInt16LE(FILES.length, 8)
end.writeUInt16LE(FILES.length, 10)
end.writeUInt32LE(centralBuf.length, 12)
end.writeUInt32LE(offset, 16)

mkdirSync(dirname(OUT), { recursive: true })
const zip = Buffer.concat([...chunks, centralBuf, end])
createWriteStream(OUT).end(zip)

// What an installed copy checks itself against, so an agent running an old
// version is told rather than left to find out.
writeFileSync(
  join(ROOT, 'public', 'ext', 'version.json'),
  JSON.stringify({ version: manifest.version }, null, 2) + '\n'
)

console.log(`RES-BMBY.zip · ${FILES.length} files · ${(zip.length / 1024).toFixed(1)} KB`)
console.log(`גרסה ${manifest.version}`)
