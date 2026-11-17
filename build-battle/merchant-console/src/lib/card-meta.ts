import { CardCategory, Currency } from "@/data/types"

/**
 * Card constants and display helpers that are safe to import from client
 * components. This file deliberately does not import the number generator: a
 * card number produced in the browser is a bug, so client code never touches
 * src/lib/card.ts.
 */

/** Largest spend limit, in minor units. */
export const MAX_LIMIT = 5_000_000

export const MAX_NICKNAME_LENGTH = 60

export const CARD_CURRENCIES: readonly Currency[] = ["USD", "EUR", "GBP"]

export const CARD_CATEGORIES: readonly CardCategory[] = [
  "software",
  "advertising",
  "contractors",
  "travel",
  "general",
]

/** How a stored card is shown everywhere except the issue response. */
export function maskCardNumber(last4: string): string {
  return `•••• ${last4}`
}
