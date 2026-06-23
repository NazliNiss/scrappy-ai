import { NextResponse } from 'next/server';
import {
  isAuthConfigured,
  isAuthEnforced,
  isPublicPath,
  SESSION_COOKIE,
  verifySessionToken,
} from '@/lib/auth';

export async function proxy(request) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  if (!isAuthEnforced()) {
    return NextResponse.next();
  }

  if (!isAuthConfigured()) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Kimlik doğrulama sunucuda yapılandırılmamış. AUTH_SECRET, AUTH_USERNAME ve AUTH_PASSWORD tanımlayın.' },
        { status: 503 }
      );
    }

    // /login'e yönlendirme döngüsünü önle — sayfayı doğrudan göster
    if (pathname === '/login') {
      return NextResponse.next();
    }

    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', 'auth_not_configured');
    return NextResponse.redirect(loginUrl);
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const isAuthenticated = token ? await verifySessionToken(token) : false;
  const isPublic = isPublicPath(pathname);

  if (isPublic) {
    if (isAuthenticated && pathname === '/login') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    return NextResponse.next();
  }

  if (pathname === '/') {
    const destination = isAuthenticated ? '/dashboard' : '/login';
    return NextResponse.redirect(new URL(destination, request.url));
  }

  if (!isAuthenticated) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Yetkisiz erişim. Lütfen giriş yapın.' },
        { status: 401 }
      );
    }

    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/login', '/dashboard', '/scrape', '/history', '/reports', '/analysis/:path*', '/api/:path*'],
};
