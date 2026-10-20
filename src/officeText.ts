// The text inside a .docx or .pptx, read in the browser (both are zip files of XML), so the AI
// gets the words without anyone converting to PDF first. No library: the zip directory is read by
// hand and each entry is inflated with the built-in DecompressionStream.

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw')
  const out = new Response(new Blob([data]).stream().pipeThrough(ds))
  return new Uint8Array(await out.arrayBuffer())
}

async function entries(buf: ArrayBuffer, want: (name: string) => boolean): Promise<{ name: string; text: string }[]> {
  const v = new DataView(buf)
  const u8 = new Uint8Array(buf)
  // End of central directory: the last 0x06054b50 signature.
  let eocd = -1
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('not a zip')
  const count = v.getUint16(eocd + 10, true)
  let p = v.getUint32(eocd + 16, true)
  const dec = new TextDecoder()
  const out: { name: string; text: string }[] = []
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break
    const method = v.getUint16(p + 10, true)
    const size = v.getUint32(p + 20, true)
    const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true)
    const local = v.getUint32(p + 42, true)
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen))
    p += 46 + nameLen + extraLen + commentLen
    if (!want(name)) continue
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
    const raw = u8.subarray(start, start + size)
    const body = method === 8 ? await inflate(raw) : raw
    out.push({ name, text: dec.decode(body) })
  }
  return out
}

const unxml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

export async function officeText(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  if (/\.docx$/i.test(file.name)) {
    const [doc] = await entries(buf, (n) => n === 'word/document.xml')
    if (!doc) throw new Error('no document')
    return unxml(doc.text.replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '')).replace(/\n{3,}/g, '\n\n').trim()
  }
  const slides = (await entries(buf, (n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)))
    .sort((a, b) => Number(a.name.match(/\d+/)![0]) - Number(b.name.match(/\d+/)![0]))
  return slides.map((s, i) => `שקף ${i + 1}: ` + unxml((s.text.match(/<a:t>([^<]*)<\/a:t>/g) ?? []).map((t) => t.slice(5, -6)).join(' '))).join('\n').trim()
}
