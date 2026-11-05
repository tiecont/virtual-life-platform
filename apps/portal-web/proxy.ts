import {NextResponse, type NextRequest} from 'next/server';
import {apiRewrite} from './server-origin';

// Forwarding only: authentication, Origin/CSRF and authorization stay in the API.
export function proxy(request: NextRequest) {
  return NextResponse.rewrite(apiRewrite(request.nextUrl.pathname, request.nextUrl.search));
}

export const config = {matcher: '/v1/:path*'};
