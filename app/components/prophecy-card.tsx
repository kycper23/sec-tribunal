'use client'

/**
 * The Prophecy Card — a shareable 1200x630 record of one settled blind trial,
 * rendered entirely client-side: an SVG string (system serif/monospace only,
 * no external fonts, engraved-book styling) rasterised through an Image +
 * canvas into a PNG download. `navigator.share` with files is offered when
 * the platform supports it (mobile). No new dependencies.
 */
import { CALL_LABEL, OUTCOME_LABEL, judgeOutcome, realityCall, tribunalCall, type Call } from '../prophecy'
import type { RealityReport, Verdict } from '../trial'

const W = 1200
const H = 630

/** Palette mirrors globals.css :root (hardcoded — an SVG string can't read CSS vars). */
const C = {
  bg: '#EDE4D0',
  panel: '#F6EFDF',
  ink: '#2A241B',
  muted: '#6E6250',
  border: '#8A7A5E',
  brass: '#7C5F18',
  red: '#A13C2C',
  green: '#3E6B4F',
}

const scoreCol = (score: number) => (score < 40 ? C.red : score < 65 ? '#A87718' : C.green)

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function buildCardSVG(opts: {
  ticker: string
  companyName: string
  cutoff: string
  score: number
  userCall: Call | null
  tribunal: Call
  actual: Call | null
}): string {
  const { ticker, companyName, cutoff, score, userCall, tribunal, actual } = opts
  const outcome = userCall !== null && actual !== null ? judgeOutcome(userCall, tribunal, actual) : null
  const won = outcome === 'user-beats-tribunal' || outcome === 'both-right'
  const rows: Array<[string, string, string, string]> = [
    [
      'YOUR PROPHECY',
      userCall ? CALL_LABEL[userCall] : '—',
      userCall && actual ? (userCall === actual ? 'RIGHT' : 'WRONG') : '',
      userCall && actual ? (userCall === actual ? C.green : C.red) : C.muted,
    ],
    [
      `THE TRIBUNAL · SCORE ${Math.round(score)}`,
      CALL_LABEL[tribunal],
      actual ? (tribunal === actual ? 'RIGHT' : 'WRONG') : '',
      actual ? (tribunal === actual ? C.green : C.red) : C.muted,
    ],
    ['REALITY · REVENUE SINCE SEAL', actual ? CALL_LABEL[actual] : 'UNSETTLED', '', C.muted],
  ]
  const rowY = (i: number) => 330 + i * 62
  const gaugeCol = scoreCol(score)
  const circ = 2 * Math.PI * 74
  const arc = (score / 100) * circ
  const name = companyName.length > 26 ? `${companyName.slice(0, 25)}…` : companyName

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" fill="${C.panel}" stroke="${C.border}" stroke-width="2"/>
  <rect x="30" y="30" width="${W - 60}" height="${H - 60}" fill="none" stroke="${C.border}" stroke-width="0.75"/>
  <text x="90" y="110" font-family="Georgia, 'Times New Roman', serif" font-size="26" letter-spacing="6" fill="${C.muted}">SEC TRIBUNAL · THE PROPHECY ENGINE</text>
  <text x="90" y="185" font-family="Georgia, 'Times New Roman', serif" font-size="60" font-weight="bold" fill="${C.ink}">${esc(ticker)} · ${esc(name)}</text>
  <text x="90" y="240" font-family="'Courier New', monospace" font-size="26" fill="${C.brass}">RECORD SEALED AT ${esc(cutoff)} — THE TRIBUNAL ARGUED BLIND</text>
  <line x1="90" y1="278" x2="820" y2="278" stroke="${C.border}" stroke-width="1"/>
  ${rows
    .map(
      ([label, call, verdictTxt, col], i) => `
  <text x="90" y="${rowY(i)}" font-family="'Courier New', monospace" font-size="22" letter-spacing="2" fill="${C.muted}">${esc(label)}</text>
  <text x="560" y="${rowY(i)}" font-family="Georgia, serif" font-size="30" font-weight="bold" fill="${C.ink}">${esc(call)}</text>
  <text x="700" y="${rowY(i)}" font-family="'Courier New', monospace" font-size="24" font-weight="bold" fill="${col}">${esc(verdictTxt)}</text>`,
    )
    .join('')}
  ${
    outcome
      ? `<g transform="rotate(-2 450 545)">
    <rect x="90" y="510" width="720" height="70" fill="none" stroke="${won ? C.green : C.red}" stroke-width="3"/>
    <text x="450" y="557" text-anchor="middle" font-family="Georgia, serif" font-size="38" font-weight="bold" letter-spacing="4" fill="${won ? C.green : C.red}">${OUTCOME_LABEL[outcome]}</text>
  </g>`
      : `<text x="90" y="555" font-family="Georgia, serif" font-size="26" font-style="italic" fill="${C.muted}">The prophecy stands unsettled — EDGAR has yet to file the answer.</text>`
  }
  <g transform="translate(985 315)">
    <circle r="108" fill="none" stroke="${C.border}" stroke-width="1.5"/>
    <circle r="100" fill="none" stroke="${C.border}" stroke-width="0.75"/>
    <circle r="74" fill="none" stroke="#D8CCB2" stroke-width="14"/>
    <circle r="74" fill="none" stroke="${gaugeCol}" stroke-width="14" stroke-dasharray="${arc.toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90)"/>
    <text y="12" text-anchor="middle" font-family="Georgia, serif" font-size="64" font-weight="bold" fill="${gaugeCol}">${Math.round(score)}</text>
    <text y="46" text-anchor="middle" font-family="'Courier New', monospace" font-size="14" letter-spacing="2" fill="${C.muted}">FINANCIAL HEALTH / 100</text>
  </g>
  <text x="${W / 2}" y="${H - 42}" text-anchor="middle" font-family="'Courier New', monospace" font-size="18" letter-spacing="3" fill="${C.muted}">EVIDENCE: SEC EDGAR · VERDICT RENDERED BLIND · NOT INVESTMENT ADVICE</text>
</svg>`
}

/** SVG string -> PNG blob via Image + canvas (2x scale for crisp share previews). */
const svgToPng = (svg: string): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = W * 2
      canvas.height = H * 2
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('Canvas unavailable'))
        return
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))), 'image/png')
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('SVG rasterisation failed'))
    }
    img.src = url
  })

export function ProphecyCardActions({
  ticker,
  companyName,
  cutoff,
  verdict,
  reality,
  userCall,
}: {
  ticker: string
  companyName: string
  cutoff: string
  verdict: Verdict
  reality: RealityReport
  userCall: Call | null
}) {
  const makePng = () =>
    svgToPng(
      buildCardSVG({
        ticker,
        companyName,
        cutoff,
        score: verdict.score,
        userCall,
        tribunal: tribunalCall(verdict),
        actual: realityCall(reality),
      }),
    )

  const download = async () => {
    try {
      const blob = await makePng()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `prophecy-${ticker}-${cutoff}.png`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      // Rasterisation failed (ancient browser) — nothing to download.
    }
  }

  const share = async () => {
    try {
      const blob = await makePng()
      const file = new File([blob], `prophecy-${ticker}-${cutoff}.png`, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'SEC Tribunal — The Prophecy Engine' })
      }
    } catch {
      // Share cancelled or unsupported — no-op.
    }
  }

  const canShare = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function'

  return (
    <div className="prophecy-card-actions">
      <button type="button" onClick={download}>
        Download prophecy card (PNG)
      </button>
      {canShare && (
        <button type="button" onClick={share}>
          Share
        </button>
      )}
    </div>
  )
}
