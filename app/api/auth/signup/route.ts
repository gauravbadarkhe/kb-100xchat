import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/src/auth/service';
import { z } from 'zod';

const SignUpSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().optional(),
  organizationName: z.string().optional(),
  organizationDescription: z.string().optional()
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate input
    const validation = SignUpSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { email, password, fullName, organizationName, organizationDescription } = validation.data;

    // Attempt sign up
    const result = await AuthService.signUp({
      email,
      password,
      fullName,
      organizationName,
      organizationDescription
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        user: result.user,
        organization: result.organization,
        needsOrganization: result.needsOrganization || false
      });
    } else {
      return NextResponse.json(
        { error: result.error || 'Sign up failed' },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Sign up error:', error);
    return NextResponse.json(
      { error: 'Internal server error', detail: error.message },
      { status: 500 }
    );
  }
}
