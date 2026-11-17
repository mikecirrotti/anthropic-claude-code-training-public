import { merchantById } from "@/data/merchants"
import { Card, CardCategory, CardStatus, Currency } from "@/data/types"

/**
 * Virtual card logic: number generation, request validation, and the status
 * state machine. Everything here is pure so it can be tested without a server.
 *
 * The full card number exists in exactly one place: the return value of
 * issueCard, which the issue route sends back once. A Card record carries the
 * last four and a reference, never the number.
 */

/** The test BIN. Every generated number starts with it. */
export const TEST_BIN = "4242"

const NUMBER_LENGTH = 16

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

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

/** The Luhn check digit that makes `payload` followed by it a valid number. */
export function luhnCheckDigit(payload: string): string {
  let sum = 0
  for (let i = 0; i < payload.length; i++) {
    let digit = Number(payload[payload.length - 1 - i])
    // The check digit will sit to the right, so the payload's rightmost digit
    // is the first one doubled.
    if (i % 2 === 0) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  return String((10 - (sum % 10)) % 10)
}

export function isValidLuhn(value: string): boolean {
  if (!/^\d{2,}$/.test(value)) return false
  return luhnCheckDigit(value.slice(0, -1)) === value.slice(-1)
}

/**
 * A 16-digit test number: the 4242 BIN, random digits, then a Luhn check digit.
 * `random` is injectable so tests are deterministic. This is a fake number on
 * a test BIN, not a secret, so Math.random is fine as the default.
 */
export function generateCardNumber(random: () => number = Math.random): string {
  let payload = TEST_BIN
  while (payload.length < NUMBER_LENGTH - 1) {
    payload += String(Math.min(9, Math.floor(random() * 10)))
  }
  return payload + luhnCheckDigit(payload)
}

/** How a stored card is shown everywhere except the issue response. */
export function maskCardNumber(last4: string): string {
  return `•••• ${last4}`
}

const TOKEN_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"

function token(random: () => number, length: number): string {
  let out = ""
  for (let i = 0; i < length; i++) {
    out += TOKEN_ALPHABET[Math.floor(random() * TOKEN_ALPHABET.length)]
  }
  return out
}

// ---------------------------------------------------------------------------
// Status state machine
// ---------------------------------------------------------------------------

/** active <-> frozen, either to cancelled, and cancelled is terminal. */
export const CARD_TRANSITIONS: Record<CardStatus, readonly CardStatus[]> = {
  active: ["frozen", "cancelled"],
  frozen: ["active", "cancelled"],
  cancelled: [],
}

export function isCardStatus(value: unknown): value is CardStatus {
  return typeof value === "string" && value in CARD_TRANSITIONS
}

export function canTransition(from: CardStatus, to: CardStatus): boolean {
  return CARD_TRANSITIONS[from].includes(to)
}

export type TransitionResult =
  | { ok: true; status: CardStatus }
  | { ok: false; error: string }

/**
 * Checks a requested status change. `to` comes from the client, so it is
 * validated here rather than trusted, and the route calls this before it
 * writes anything.
 */
export function transitionStatus(from: CardStatus, to: unknown): TransitionResult {
  if (!isCardStatus(to)) return { ok: false, error: "Unknown card status." }
  if (from === "cancelled") {
    return { ok: false, error: "A cancelled card cannot change status." }
  }
  if (!canTransition(from, to)) {
    return { ok: false, error: `A ${from} card cannot become ${to}.` }
  }
  return { ok: true, status: to }
}

// ---------------------------------------------------------------------------
// Issue request
// ---------------------------------------------------------------------------

export type IssueField =
  | "nickname"
  | "merchantId"
  | "limit"
  | "currency"
  | "category"

export interface IssueCardInput {
  nickname: string
  merchantId: string
  /** Integer minor units. */
  limit: number
  currency: Currency
  category: CardCategory | null
}

export type IssueValidation =
  | { ok: true; value: IssueCardInput }
  | { ok: false; errors: Partial<Record<IssueField, string>> }

/**
 * Everything on an issue request comes from the client, so every field is
 * checked against a rule or an allowlist before it can reach the store.
 */
export function validateIssueRequest(input: unknown): IssueValidation {
  const body =
    typeof input === "object" && input !== null && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {}
  const errors: Partial<Record<IssueField, string>> = {}

  const nickname = typeof body.nickname === "string" ? body.nickname.trim() : ""
  if (!nickname) errors.nickname = "Give the card a nickname."
  else if (nickname.length > MAX_NICKNAME_LENGTH) {
    errors.nickname = `Nickname must be ${MAX_NICKNAME_LENGTH} characters or fewer.`
  }

  const merchantId = typeof body.merchantId === "string" ? body.merchantId : ""
  if (!merchantId) errors.merchantId = "Choose a merchant."
  else if (!merchantById(merchantId)) errors.merchantId = "Unknown merchant."

  const limit = body.limit
  if (limit === undefined || limit === null) {
    errors.limit = "Set a spend limit."
  } else if (typeof limit !== "number" || !Number.isInteger(limit)) {
    errors.limit = "The limit must be a whole number of minor units."
  } else if (limit <= 0) {
    errors.limit = "The limit must be greater than zero."
  } else if (limit > MAX_LIMIT) {
    errors.limit = `The limit cannot exceed ${MAX_LIMIT} minor units.`
  }

  const currency = body.currency
  if (currency === undefined || currency === null || currency === "") {
    errors.currency = "Choose a currency."
  } else if (!CARD_CURRENCIES.includes(currency as Currency)) {
    errors.currency = `Currency must be one of ${CARD_CURRENCIES.join(", ")}.`
  }

  let category: CardCategory | null = null
  if (body.category !== undefined && body.category !== null && body.category !== "") {
    if (CARD_CATEGORIES.includes(body.category as CardCategory)) {
      category = body.category as CardCategory
    } else {
      errors.category = "Unknown merchant category."
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  return {
    ok: true,
    value: {
      nickname,
      merchantId,
      limit: limit as number,
      currency: currency as Currency,
      category,
    },
  }
}

// ---------------------------------------------------------------------------
// Issuing
// ---------------------------------------------------------------------------

export interface IssueOptions {
  random?: () => number
  now?: Date
}

/**
 * Builds a card from a validated request. Returns the record to store and the
 * full number to reveal once. The record has no number field, so storing it
 * cannot persist one.
 */
export function issueCard(
  input: IssueCardInput,
  options: IssueOptions = {},
): { card: Card; number: string } {
  const random = options.random ?? Math.random
  const now = options.now ?? new Date()
  const number = generateCardNumber(random)

  return {
    number,
    card: {
      id: `card_${token(random, 10)}`,
      merchantId: input.merchantId,
      nickname: input.nickname,
      limit: input.limit,
      currency: input.currency,
      last4: number.slice(-4),
      reference: `ref_${token(random, 16)}`,
      status: "active",
      category: input.category,
      spent: 0,
      createdAt: now.toISOString(),
    },
  }
}
