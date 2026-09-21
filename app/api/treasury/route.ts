/** Treasury status for the public demo UI's balance bar. */
import { NextResponse } from 'next/server'
import { treasuryStatus } from '../../../src/orbio/treasury.js'
import { withErrorHandling } from '../_lib.js'

export const dynamic = 'force-dynamic'

export const GET = withErrorHandling(async (_req: Request) => {
  try {
    const status = await treasuryStatus()
    return NextResponse.json(status)
  } catch (err) {
    console.error('treasuryStatus failed:', err)
    return NextResponse.json({ availableUsd: null, trialsLeft: null, perTrialUsd: 0.22 })
  }
})
