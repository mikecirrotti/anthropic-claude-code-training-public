import { NextResponse } from "next/server"

/**
 * One error shape for every card route: a status code that means what it says
 * and a message safe to show a user, with per-field messages when a request
 * has several problems. It matches the { error } body the payments export uses.
 */
export function errorResponse(
  status: number,
  message: string,
  fields?: Record<string, string | undefined>,
) {
  return NextResponse.json(
    fields ? { error: message, fields } : { error: message },
    { status },
  )
}

/** Reads a JSON body without letting malformed input turn into a 500. */
export async function readJson(
  request: Request,
): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await request.json() }
  } catch {
    return { ok: false }
  }
}
