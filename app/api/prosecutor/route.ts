/** Stage 2: the prosecution builds the bear case (one model call). */
import { NextResponse } from 'next/server'
import { runProsecutor } from '../../../src/tribunal/agents.js'
import { asString, jsonError } from '../_lib.js'

export const maxDuration = 300

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const brief = asString(body.brief)
  if (!brief) return jsonError('Missing "brief".')
  return NextResponse.json({ bearCase: await runProsecutor(brief) })
}
