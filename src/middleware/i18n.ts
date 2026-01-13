import { NextRequest, NextResponse } from 'next/server';
import { i18n } from '../../next-i18next.config';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Check if there is any supported locale in pathname
  const pathnameIsMissingLocale = i18n.locales.every(
    (locale) => !pathname.startsWith(`/${locale}/`) && pathname !== `/${locale}`
  );

  // Redirect if there is no locale
  if (pathnameIsMissingLocale) {
    // Check for locale in cookie first
    const localeCookie = request.cookies.get('NEXT_LOCALE')?.value;
    const locale = localeCookie && i18n.locales.includes(localeCookie)
      ? localeCookie
      : i18n.defaultLocale;

    return NextResponse.redirect(
      new URL(`/${locale}${pathname}`, request.url)
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip all internal paths (_next, api, etc.)
    '/((?!api|_next/static|_next/image|favicon|public|_next).*)',
  ],
};
