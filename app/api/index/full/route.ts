import { NextRequest, NextResponse } from 'next/server'
import { fullSync } from '../../../../src/sync'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { installationId, repoFullName } = body || {}
    
    if (!installationId || !repoFullName) {
      return NextResponse.json(
        { error: "installationId, repoFullName required" },
        { status: 400 }
      )
    }
    
    await fullSync(Number(installationId), String(repoFullName))
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('Full sync error:', error)
    return NextResponse.json(
      { error: 'sync_failed', detail: error?.message || 'unknown' },
      { status: 500 }
    )
  }
}
