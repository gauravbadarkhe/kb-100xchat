import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/src/auth/service';

export async function POST(request: NextRequest) {
  try {
    const result = await AuthService.signOut();

    if (result.success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { error: result.error || 'Sign out failed' },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Sign out error:', error);
    return NextResponse.json(
      { error: 'Internal server error', detail: error.message },
      { status: 500 }
    );
  }
}
