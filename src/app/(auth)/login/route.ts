import { NextResponse } from "next/server";

export async function GET() {
  const params = new URLSearchParams({
    client_id: process.env.COGNITO_CLIENT_ID!,
    response_type: "code",
    scope: "openid profile email phone",
    redirect_uri: process.env.COGNITO_REDIRECT_URI!,
  });

  return NextResponse.redirect(
    `${process.env.COGNITO_DOMAIN}/login?${params.toString()}`,
    { status: 307 }
  );
}
