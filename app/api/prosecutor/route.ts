/** Stage 2: the prosecution builds the bear case (one model call). */
import { NextResponse } from 'next/server'
import { runProsecutor } from '../../../src/tribunal/agents.js'
import { asString, guardModelCall, jsonError, withErrorHandling } from '../_lib.js'

export const maxDuration = 300

export const POST = withErrorHandling(async (req: Request) => {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const brief = asString(body.brief)
  if (!brief) return jsonError('Missing "brief".')
  const blocked = await guardModelCall(req, [brief])
  if (blocked) return blocked as NextResponse
  const { bearCase, usage } = await runProsecutor(brief)
  return NextResponse.json({ bearCase, usage })
})
