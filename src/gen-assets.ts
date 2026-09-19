/**
 * One-shot asset generator for the "council of sages" redesign.
 *
 * Generates the hero scene and the three sage portraits via the Orbio
 * `/api/v1/images` endpoint (same pattern as src/examples/05-image.ts),
 * post-processes them with sharp (crop/resize + recompressed JPEG under a
 * byte budget) and saves them into public/. Idempotent: skips files that
 * already exist, so a re-run only regenerates what you deleted.
 *
 *   pnpm gen-assets            # generate missing assets
 *   pnpm gen-assets --force    # regenerate everything
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { openrouterFetch } from './lib/openrouter.js'

const MODEL = process.env.OPENROUTER_IMAGE_MODEL ?? 'openai/gpt-image-1'
const OUT_DIR = 'public'
const FORCE = process.argv.includes('--force')

/** Shared pixel-art style suffix so the three portraits read as one artwork. */
const PORTRAIT_SUFFIX =
  ', side-lit, limited warm color palette, crisp pixel edges, dark simple background, ' +
  'square composition, waist up, no text'

type Asset = {
  /** Final filename written under public/ — always .jpg. */
  file: string
  /** Size requested from the image model. */
  genSize: '1024x1024' | '1536x1024'
  prompt: string
  /** Final pixel dimensions after crop/resize (sharp `fit: 'cover'`). */
  outSize: { width: number; height: number }
  /** Soft byte budget — quality steps down until the JPEG fits under this. */
  maxBytes: number
}

const ASSETS: Asset[] = [
  {
    file: 'scene-hero.jpg',
    genSize: '1536x1024',
    outSize: { width: 1536, height: 864 }, // crop 3:2 → 16:9
    maxBytes: 250 * 1024,
    prompt:
      'Pixel art scene, 16-bit retro game style, interior of an ancient mountain temple hall ' +
      'viewed straight-on from the front, wide symmetrical composition, stone pillars on ' +
      'both sides, colorful prayer flags strung across the top, large open archway in the ' +
      'center back showing snowy mountain peaks at golden hour, warm torch light, low raised ' +
      'stone platform in the foreground center, empty with no characters, dark atmospheric ' +
      'background with silhouetted details, limited warm color palette of oranges browns ' +
      'and deep blues, crisp pixel edges, no text, wide 16:9',
  },
  {
    file: 'sage-skeptic.jpg',
    genSize: '1024x1024',
    outSize: { width: 512, height: 512 },
    maxBytes: 100 * 1024,
    prompt:
      'Pixel art character portrait, 16-bit retro game style, wise old monk in orange robes ' +
      'seated cross-legged, stern skeptical face with furrowed brow, arms crossed' +
      PORTRAIT_SUFFIX,
  },
  {
    file: 'sage-advocate.jpg',
    genSize: '1024x1024',
    outSize: { width: 512, height: 512 },
    maxBytes: 100 * 1024,
    prompt:
      'Pixel art character portrait, 16-bit retro game style, wise monk in orange robes ' +
      'seated cross-legged, calm confident face, open welcoming hand gesture' +
      PORTRAIT_SUFFIX,
  },
  {
    file: 'sage-arbiter.jpg',
    genSize: '1024x1024',
    outSize: { width: 512, height: 512 },
    maxBytes: 100 * 1024,
    prompt:
      'Pixel art character portrait, 16-bit retro game style, ancient elder monk in orange ' +
      'robes seated cross-legged, long white beard, eyes closed in meditation, serene ' +
      'dignified face' +
      PORTRAIT_SUFFIX,
  },
]

/**
 * Crop/resize `source` to `outSize` (cover fit, centered) and re-encode as a
 * JPEG, stepping mozjpeg quality down until the result fits under
 * `maxBytes` (or we hit the quality floor — whichever comes first).
 */
const toJpegUnderBudget = async (
  source: Buffer,
  outSize: { width: number; height: number },
  maxBytes: number,
): Promise<Buffer> => {
  const qualities = [85, 78, 70, 62, 55, 48, 40, 32, 25]
  let best: Buffer | null = null
  for (const quality of qualities) {
    const out = await sharp(source)
      .resize(outSize.width, outSize.height, { fit: 'cover', position: 'attention' })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer()
    best = out
    if (out.length <= maxBytes) break
  }
  return best!
}

const generate = async (asset: Asset): Promise<void> => {
  const path = join(OUT_DIR, asset.file)
  if (!FORCE && existsSync(path)) {
    console.log(`= ${path} (exists, skipped — use --force to regenerate)`)
    return
  }
  console.log(`… generating ${path} [${MODEL}, ${asset.genSize}]`)
  const res = await openrouterFetch('/images', {
    method: 'POST',
    body: JSON.stringify({
      model: MODEL,
      prompt: asset.prompt,
      n: 1,
      size: asset.genSize,
      output_format: 'png', // lossless source — we recompress to JPEG ourselves below
    }),
  })
  if (!res.ok) throw new Error(`${asset.file}: ${res.status} ${await res.text()}`)
  const body = (await res.json()) as { data: Array<{ b64_json?: string; url?: string }> }
  const image = body.data[0]

  let raw: Buffer
  if (image.b64_json) {
    raw = Buffer.from(image.b64_json, 'base64')
  } else if (image.url) {
    const download = await fetch(image.url)
    if (!download.ok) throw new Error(`${asset.file}: download failed ${download.status}`)
    raw = Buffer.from(await download.arrayBuffer())
  } else {
    throw new Error(`${asset.file}: response had neither b64_json nor url`)
  }

  const jpeg = await toJpegUnderBudget(raw, asset.outSize, asset.maxBytes)
  await writeFile(path, jpeg)
  const kb = (jpeg.length / 1024).toFixed(1)
  console.log(`→ ${path} (${asset.outSize.width}x${asset.outSize.height}, ${kb} KB)`)
}

await mkdir(OUT_DIR, { recursive: true })
for (const asset of ASSETS) await generate(asset)
console.log('Done.')

