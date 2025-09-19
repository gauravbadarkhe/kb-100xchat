import { NextRequest, NextResponse } from 'next/server'
import { search } from '../../../src/util'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const q = searchParams.get('q') || ''
    
    if (!q) {
      return NextResponse.json({ error: 'missing q' }, { status: 400 })
    }
    
    const k = Number(searchParams.get('k') || 8)
    const results = await search(q, k)
    
    return NextResponse.json(results)
  } catch (error: any) {
    console.error('Search error:', error)
    return NextResponse.json(
      { error: 'search_failed', detail: error?.message || 'unknown' },
      { status: 500 }
    )
  }
}
