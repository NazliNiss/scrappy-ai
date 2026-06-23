import { NextResponse } from 'next/server';
import {
  createSessionToken,
  getSessionCookieOptions,
  isAuthConfigured,
  isAuthEnforced,
  SESSION_COOKIE,
  verifyCredentials,
} from '@/lib/auth';

export async function POST(request) {
  try {
    if (!isAuthEnforced()) {
      return NextResponse.json({ success: true, authRequired: false });
    }

    if (!isAuthConfigured()) {
      return NextResponse.json(
        { error: 'Kimlik doğrulama sunucuda yapılandırılmamış.' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const username = body?.username?.trim() || '';
    const password = body?.password || '';

    if (!verifyCredentials(username, password)) {
      return NextResponse.json(
        { error: 'Geçersiz kullanıcı adı veya şifre.' },
        { status: 401 }
      );
    }

    const token = await createSessionToken();
    const response = NextResponse.json({ success: true, authRequired: true });
    response.cookies.set(SESSION_COOKIE, token, getSessionCookieOptions());

    return response;
  } catch (error) {
    console.error('Auth login error:', error);
    return NextResponse.json(
      { error: 'Giriş işlemi sırasında bir hata oluştu.' },
      { status: 500 }
    );
  }
}
