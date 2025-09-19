import { NextRequest, NextResponse } from 'next/server'
import { AuthService } from '@/src/auth/service'
import { usersRepo, organizationsRepo } from '@/src/auth/repositories'

export async function GET(request: NextRequest) {
  try {
    const authContext = await AuthService.getCurrentAuthContext()
    
    if (!authContext) {
      return NextResponse.json({ authenticated: false })
    }

    // Get user and organization data
    const [user, organization] = await Promise.all([
      usersRepo.findById(authContext.user_id),
      organizationsRepo.findById(authContext.organization_id)
    ])

    return NextResponse.json({
      authenticated: true,
      user,
      organization,
      authContext
    })
  } catch (error: any) {
    console.error('Session check error:', error)
    return NextResponse.json({ authenticated: false }, { status: 500 })
  }
}
