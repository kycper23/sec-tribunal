/** Stage 4: the prosecution's cross-examination rebuttal (one model call). */
import { NextResponse } from 'next/server'
import { runProsecutorRebuttal } from '../../../src/tribunal/agents.js'
import { asString, jsonError } from '../_lib.js'

export const maxDuration = 300

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const brief = asString(body.brief)
  const bearCase = asString(body.bearCase)
  const defense = asString(body.defense)
  if (!brief || !bearCase || !defense) return jsonError('Missing "brief", "bearCase" or "defense".')
  return NextResponse.json({ rebuttal: await runProsecutorRebuttal(brief, bearCase, defense) })
}
