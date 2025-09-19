import { NextRequest, NextResponse } from 'next/server'
import { Webhooks } from '@octokit/webhooks'
import { handleWebhook } from '../../../src/webhook'

const webhooks = new Webhooks({ secret: process.env.GITHUB_WEBHOOK_SECRET! })
webhooks.onAny(handleWebhook)

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = request.headers.get('x-hub-signature-256')
    const event = request.headers.get('x-github-event')
    
    if (!signature || !event) {
      return NextResponse.json({ error: 'Missing required headers' }, { status: 400 })
    }

    const id = request.headers.get('x-github-delivery') || 'unknown'
    
    await webhooks.verifyAndReceive({
      id,
      name: event as any,
      signature,
      payload: body,
    })
    
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('Webhook error:', error)
    return NextResponse.json(
      { error: 'webhook_failed', detail: error?.message || 'unknown' },
      { status: 500 }
    )
  }
}
