import { cardById, updateCard } from "@/data/queries"
import { applyTransition, isCardStatus } from "@/lib/card"
import { NextResponse } from "next/server"
import { errorResponse, readJson } from "../responses"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params
  const card = cardById(id)
  if (!card) return errorResponse(404, "Card not found.")
  return NextResponse.json({ card })
}

/**
 * Changes a card's status. The state machine is enforced here, on the server,
 * so a direct request cannot do what the UI would not allow: an illegal change
 * is refused with 409 and the stored card is left exactly as it was.
 */
export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params
  const card = cardById(id)
  if (!card) return errorResponse(404, "Card not found.")

  const parsed = await readJson(request)
  if (!parsed.ok) return errorResponse(400, "Request body must be valid JSON.")

  const status =
    typeof parsed.body === "object" && parsed.body !== null
      ? (parsed.body as { status?: unknown }).status
      : undefined
  if (!isCardStatus(status)) {
    return errorResponse(400, "Unknown card status.", {
      status: "Use active, frozen or cancelled.",
    })
  }

  const result = applyTransition(card, status)
  if (!result.ok) return errorResponse(409, result.error)

  updateCard(result.card)
  return NextResponse.json({ card: result.card })
}
