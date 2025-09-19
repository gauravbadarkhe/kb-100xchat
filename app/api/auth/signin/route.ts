import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/src/auth/service';
import { z } from 'zod';

const SignInSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate input
    const validation = SignInSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { email, password } = validation.data;

    // Attempt sign in
    const result = await AuthService.signIn({ email, password });

    if (result.success) {
      return NextResponse.json({
        success: true,
        user: result.user,
        organization: result.organization,
        needsOrganization: result.needsOrganization || false
      });
    } else {
      return NextResponse.json(
        { error: result.error || 'Sign in failed' },
        { status: 401 }
      );
    }
  } catch (error: any) {
    console.error('Sign in error:', error);
    return NextResponse.json(
      { error: 'Internal server error', detail: error.message },
      { status: 500 }
    );
  }
}
