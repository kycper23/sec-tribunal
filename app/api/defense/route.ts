/** Stage 3: the defense answers, optionally armed with peer data (one model call). */
import { NextResponse } from 'next/server'
import { runDefense } from '../../../src/tribunal/agents.js'
import { asString, guardModelCall, jsonError, withErrorHandling } from '../_lib.js'

export const maxDuration = 300

export const POST = withErrorHandling(async (req: Request) => {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const brief = asString(body.brief)
  const bearCase = asString(body.bearCase)
  if (!brief || !bearCase) return jsonError('Missing "brief" or "bearCase".')
  const peerBrief = asString(body.peerBrief) || null
  const blocked = await guardModelCall(req, [brief, bearCase, peerBrief ?? ''])
  if (blocked) return blocked as NextResponse
  const { defense, usage } = await runDefense(brief, bearCase, peerBrief)
  return NextResponse.json({ defense, usage })
})
