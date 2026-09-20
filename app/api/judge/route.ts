/** Stage 5: the judge weighs all three voices and returns the structured verdict. */
import { NextResponse } from 'next/server'
import { runJudge } from '../../../src/tribunal/agents.js'
import type { ForensicsResult } from '../../../src/sec/forensics.js'
import { asString, jsonError, withErrorHandling } from '../_lib.js'

export const maxDuration = 300

export const POST = withErrorHandling(async (req: Request) => {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const bearCase = asString(body.bearCase)
  const defense = asString(body.defense)
  const rebuttal = asString(body.rebuttal)
  // Optional: the clerk's deterministic forensic report, computed earlier by
  // /api/evidence and passed straight through by the client — not
  // recomputed here.
  const forensic = body.forensic as ForensicsResult | undefined
  if (!bearCase || !defense || !rebuttal) return jsonError('Missing "bearCase", "defense" or "rebuttal".')
  const { verdict, usage } = await runJudge(bearCase, defense, rebuttal, forensic)
  return NextResponse.json({ verdict, usage })
})
