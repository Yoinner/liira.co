const testSecret = "1x0000000000000000000000000000000AA";

export async function verifyTurnstile(token: string, request: Request) {
  const secret = process.env.TURNSTILE_SECRET_KEY || (process.env.NODE_ENV === "development" ? testSecret : "");
  if (!secret || !token || (secret === testSecret && process.env.VERCEL_ENV !== "preview" && process.env.NODE_ENV !== "development")) return false;
  try {
    const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!result.ok) return false;
    const data = await result.json() as { success?: boolean; hostname?: string };
    return data.success === true && (secret === testSecret || data.hostname === new URL(request.url).hostname);
  } catch { return false; }
}
