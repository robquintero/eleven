import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session cookie on every request. This is
 * Next.js 16's `proxy.ts` (the renamed, non-deprecated successor to
 * `middleware.ts` — see node_modules/next/dist/docs/01-app/03-api-reference/
 * 03-file-conventions/proxy.md) doing the same job the Supabase Next.js
 * guides normally wire up in `middleware.ts`: nothing else changed.
 *
 * If Supabase isn't configured (no env vars — the app's existing mock/demo
 * experience doesn't require it), this no-ops rather than throwing, so the
 * rest of the app keeps working exactly as it did before this pass.
 */
export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Required: reading the session is what triggers a token refresh (and
  // the setAll call above) when the access token has expired. Skipping
  // this call is the most common cause of "random logouts" with
  // @supabase/ssr.
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on every route except static assets and image optimization
     * files, so auth stays fresh everywhere without wasting cycles on
     * things that can't read cookies anyway.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
