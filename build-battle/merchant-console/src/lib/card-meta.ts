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

export const CATEGORY_LABELS: Record<CardCategory, string> = {
  software: "Software",
  advertising: "Advertising",
  contractors: "Contractors",
  travel: "Travel",
  general: "General",
}

/** Spend strictly above this share of the limit turns the progress bar amber. */
export const AMBER_PERCENT = 80

/**
 * True when spend is above 80% of the limit. Compares the integers directly,
 * so 80.5% counts even though a whole-percent display would round it to 80.
 */
export function isNearLimit(spent: number, limit: number): boolean {
  return limit > 0 && spent * 100 > limit * AMBER_PERCENT
}

/** Bar width as a whole percent, clamped to 0-100. Display only. */
export function spendPercent(spent: number, limit: number): number {
  if (limit <= 0) return 0
  return Math.min(100, Math.max(0, Math.floor((spent * 100) / limit)))
}

/** How a stored card is shown everywhere except the issue response. */
export function maskCardNumber(last4: string): string {
  return `•••• ${last4}`
}
