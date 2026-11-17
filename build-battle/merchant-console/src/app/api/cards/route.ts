import { listCards } from "@/data/queries"
import { store } from "@/data/store"
import { issueCard, validateIssueRequest } from "@/lib/card"
import { NextResponse } from "next/server"
import { errorResponse, readJson } from "./responses"

export const dynamic = "force-dynamic"

/** Every issued card, newest first. Records carry the last four, never a number. */
export function GET() {
  const rows = listCards()
  return NextResponse.json({ rows, total: rows.length })
}

/**
 * Issues a card. The request is validated on the server before anything
 * reaches the store, the number is generated here, and the full number is
 * returned in this response and nowhere else. The stored record has no field
 * to hold it.
 */
export async function POST(request: Request) {
  const parsed = await readJson(request)
  if (!parsed.ok) return errorResponse(400, "Request body must be valid JSON.")

  const result = validateIssueRequest(parsed.body)
  if (!result.ok) {
    return errorResponse(400, "The card request is not valid.", result.errors)
  }

  const { card, number } = issueCard(result.value)
  store.cards.push(card)

  return NextResponse.json(
    { card, number },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  )
}
