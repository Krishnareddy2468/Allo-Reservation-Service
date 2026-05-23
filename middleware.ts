import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";

export const SESSION_COOKIE = "sid";

// Set an anonymous session cookie on every request that doesn't already have one.
// This gives each browser a stable identity without requiring sign-in.
// Trade-off documented in README: a real system would tie this to a user account.
export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  if (!request.cookies.get(SESSION_COOKIE)) {
    response.cookies.set(SESSION_COOKIE, randomUUID(), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      // 30-day expiry: long enough to outlive any checkout session
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
