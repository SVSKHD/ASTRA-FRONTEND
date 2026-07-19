import { NextRequest, NextResponse } from "next/server";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = searchParams.get("state"); // Optional: Verify state to prevent CSRF

  if (error) {
    return NextResponse.redirect(`${APP_URL}/dashboard?error=${error}`);
  }

  if (!code) {
    return NextResponse.redirect(`${APP_URL}/dashboard?error=no_code`);
  }

  try {
    const tokenResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code,
        }),
      },
    );

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error("GitHub Token Error:", tokenData.error_description);
      return NextResponse.redirect(
        `${APP_URL}/?error=${encodeURIComponent(tokenData.error_description)}`,
      );
    }

    // Redirect to dashboard with token
    // Security Note: Passing token in URL is not ideal for high security but fine for this client-side exchange
    // Better approach would be setting a cookie, but user asked to match existing callback pattern
    return NextResponse.redirect(
      `${APP_URL}/?github_token=${tokenData.access_token}`,
    );
  } catch (err) {
    console.error("Callback Error:", err);
    return NextResponse.redirect(`${APP_URL}/?error=server_error`);
  }
}
