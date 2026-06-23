import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  isAuthConfigured,
  isAuthEnforced,
  isPublicPath,
  SESSION_COOKIE,
  verifySessionToken,
} from '@/lib/auth';

export async function requireApiAuth(request) {
  const { pathname } = new URL(request.url);

  if (isPublicPath(pathname)) {
    return null;
  }

  if (!isAuthEnforced()) {
    return null;
  }

  if (!isAuthConfigured()) {
    return NextResponse.json(
      { error: 'Kimlik doğrulama sunucuda yapılandırılmamış. AUTH_SECRET, AUTH_USERNAME ve AUTH_PASSWORD tanımlayın.' },
      { status: 503 }
    );
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const isValid = token ? await verifySessionToken(token) : false;

  if (!isValid) {
    return NextResponse.json(
      { error: 'Yetkisiz erişim. Lütfen giriş yapın.' },
      { status: 401 }
    );
  }

  return null;
}
