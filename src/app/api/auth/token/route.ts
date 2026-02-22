import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
    const cookieStore = await cookies();
    const session = cookieStore.get("session");

    if (!session) {
        return NextResponse.json({ error: "No session" }, { status: 401 });
    }

    // Devolvemos el ID Token crudo para que Axios lo use
    return NextResponse.json({ token: session.value });
}