import { describe, expect, it } from "vitest"
import { CardStatus } from "@/data/types"
import {
  CARD_CURRENCIES,
  CARD_TRANSITIONS,
  IssueCardInput,
  MAX_LIMIT,
  TEST_BIN,
  applyTransition,
  canTransition,
  generateCardNumber,
  isCardStatus,
  isValidLuhn,
  issueCard,
  luhnCheckDigit,
  maskCardNumber,
  transitionStatus,
  validateIssueRequest,
} from "./card"

/**
 * Cards are the one place a mistake leaks a number or lets a bad limit through,
 * so the generator, the validator and the state machine all have cases here.
 * Every card number in this file is generated on the 4242 test BIN.
 */

/** Small deterministic PRNG so generated numbers are the same on every run. */
function seeded(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const valid = {
  nickname: "Ad spend",
  merchantId: "mch_01",
  limit: 25000,
  currency: "USD",
}

describe("luhn", () => {
  it("computes the check digit for a known payload", () => {
    expect(luhnCheckDigit("7992739871")).toBe("3")
  })

  it("accepts a valid number and rejects a one-digit change", () => {
    expect(isValidLuhn("79927398713")).toBe(true)
    expect(isValidLuhn("79927398714")).toBe(false)
  })

  it("rejects anything that is not digits", () => {
    expect(isValidLuhn("")).toBe(false)
    expect(isValidLuhn("4242 4242")).toBe(false)
    expect(isValidLuhn("abcd")).toBe(false)
  })
})

describe("generateCardNumber", () => {
  it("is 16 digits on the 4242 BIN with a valid Luhn check digit, every time", () => {
    const random = seeded(42)
    for (let i = 0; i < 500; i++) {
      const number = generateCardNumber(random)
      expect(number).toMatch(/^\d{16}$/)
      expect(number.startsWith(TEST_BIN)).toBe(true)
      expect(isValidLuhn(number)).toBe(true)
    }
  })

  it("holds with the default random source too", () => {
    for (let i = 0; i < 200; i++) {
      const number = generateCardNumber()
      expect(number.startsWith(TEST_BIN)).toBe(true)
      expect(number).toHaveLength(16)
      expect(isValidLuhn(number)).toBe(true)
    }
  })

  it("is deterministic for a given random source", () => {
    expect(generateCardNumber(seeded(7))).toBe(generateCardNumber(seeded(7)))
  })

  it("survives a random source that returns its extremes", () => {
    for (const edge of [0, 0.999999999]) {
      const number = generateCardNumber(() => edge)
      expect(number.startsWith(TEST_BIN)).toBe(true)
      expect(isValidLuhn(number)).toBe(true)
    }
  })
})

describe("maskCardNumber", () => {
  it("shows only the last four", () => {
    expect(maskCardNumber("4242")).toBe("•••• 4242")
  })
})

describe("status transitions", () => {
  const statuses: CardStatus[] = ["active", "frozen", "cancelled"]
  const allowed = new Set([
    "active>frozen",
    "frozen>active",
    "active>cancelled",
    "frozen>cancelled",
  ])

  it("allows exactly active<->frozen and either to cancelled", () => {
    for (const from of statuses) {
      for (const to of statuses) {
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(
          allowed.has(`${from}>${to}`),
        )
      }
    }
  })

  it("never lets a cancelled card change", () => {
    expect(CARD_TRANSITIONS.cancelled).toEqual([])
    for (const to of statuses) {
      expect(transitionStatus("cancelled", to).ok).toBe(false)
    }
  })

  it("returns the new status for a legal change", () => {
    expect(transitionStatus("active", "frozen")).toEqual({
      ok: true,
      status: "frozen",
    })
    expect(transitionStatus("frozen", "active")).toEqual({
      ok: true,
      status: "active",
    })
  })

  it("refuses to stay in the same status", () => {
    expect(transitionStatus("active", "active").ok).toBe(false)
  })

  it("rejects a status that is not on the list", () => {
    for (const bad of ["closed", "", null, undefined, 3, {}]) {
      expect(transitionStatus("active", bad).ok).toBe(false)
    }
  })
})

describe("validateIssueRequest", () => {
  it("accepts a good request and trims the nickname", () => {
    const result = validateIssueRequest({ ...valid, nickname: "  Ad spend  " })
    expect(result).toEqual({
      ok: true,
      value: { ...valid, nickname: "Ad spend", category: null },
    })
  })

  it("rejects a missing or unknown merchant", () => {
    const { merchantId: _omit, ...missing } = valid
    expect(validateIssueRequest(missing)).toMatchObject({
      ok: false,
      errors: { merchantId: expect.any(String) },
    })
    expect(validateIssueRequest({ ...valid, merchantId: "" }).ok).toBe(false)
    expect(validateIssueRequest({ ...valid, merchantId: "mch_999" }).ok).toBe(false)
  })

  it("rejects a limit of zero or less", () => {
    for (const limit of [0, -1, -25000]) {
      expect(validateIssueRequest({ ...valid, limit }).ok, String(limit)).toBe(false)
    }
  })

  it("rejects a limit above 5,000,000 minor units but accepts the boundary", () => {
    expect(validateIssueRequest({ ...valid, limit: MAX_LIMIT }).ok).toBe(true)
    expect(validateIssueRequest({ ...valid, limit: MAX_LIMIT + 1 }).ok).toBe(false)
    expect(validateIssueRequest({ ...valid, limit: 1 }).ok).toBe(true)
  })

  it("rejects a limit that is not an integer number of minor units", () => {
    const bad: unknown[] = [250.5, "25000", "$250.00", NaN, Infinity, true, null]
    for (const limit of bad) {
      expect(validateIssueRequest({ ...valid, limit }).ok, String(limit)).toBe(false)
    }
  })

  it("rejects a currency outside USD, EUR and GBP", () => {
    for (const currency of ["JPY", "usd", "", "US", null, 840]) {
      expect(validateIssueRequest({ ...valid, currency }).ok, String(currency)).toBe(false)
    }
    for (const currency of CARD_CURRENCIES) {
      expect(validateIssueRequest({ ...valid, currency }).ok).toBe(true)
    }
  })

  it("accepts a currency that differs from the merchant's own", () => {
    // mch_01 is a USD merchant. The server accepts it; the form only warns.
    expect(validateIssueRequest({ ...valid, currency: "EUR" }).ok).toBe(true)
  })

  it("requires a nickname and caps its length", () => {
    expect(validateIssueRequest({ ...valid, nickname: "   " }).ok).toBe(false)
    expect(validateIssueRequest({ ...valid, nickname: "x".repeat(61) }).ok).toBe(false)
    expect(validateIssueRequest({ ...valid, nickname: "x".repeat(60) }).ok).toBe(true)
  })

  it("checks an optional category against the allowlist", () => {
    expect(validateIssueRequest({ ...valid, category: "travel" })).toMatchObject({
      ok: true,
      value: { category: "travel" },
    })
    expect(validateIssueRequest({ ...valid, category: "gambling" }).ok).toBe(false)
  })

  it("reports every problem at once, not just the first", () => {
    const result = validateIssueRequest({ limit: 0, currency: "JPY" })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(
        ["currency", "limit", "merchantId", "nickname"].sort(),
      )
    }
  })

  it("rejects a body that is not an object", () => {
    for (const body of [null, undefined, "card", 5, []]) {
      expect(validateIssueRequest(body).ok).toBe(false)
    }
  })
})

describe("issueCard", () => {
  const input: IssueCardInput = {
    nickname: "Ad spend",
    merchantId: "mch_01",
    limit: 25000,
    currency: "USD",
    category: null,
  }
  const now = new Date("2026-08-13T10:00:00.000Z")

  it("returns the full number once, and a card that cannot hold it", () => {
    const { card, number } = issueCard(input, { random: seeded(1), now })

    expect(number.startsWith(TEST_BIN)).toBe(true)
    expect(isValidLuhn(number)).toBe(true)

    expect(card).not.toHaveProperty("number")
    expect(JSON.stringify(card)).not.toContain(number)
    expect(card.last4).toBe(number.slice(-4))
    expect(card.reference).not.toContain(number)
  })

  it("starts active with nothing spent, in minor units, stamped in UTC", () => {
    const { card } = issueCard(input, { random: seeded(1), now })
    expect(card).toMatchObject({
      status: "active",
      spent: 0,
      limit: 25000,
      currency: "USD",
      createdAt: "2026-08-13T10:00:00.000Z",
    })
  })

  it("gives different cards different ids and references", () => {
    const random = seeded(3)
    const a = issueCard(input, { random, now })
    const b = issueCard(input, { random, now })
    expect(a.card.id).not.toBe(b.card.id)
    expect(a.card.reference).not.toBe(b.card.reference)
    expect(a.number).not.toBe(b.number)
  })
})

describe("isCardStatus", () => {
  it("accepts only the three statuses, not inherited object keys", () => {
    for (const ok of ["active", "frozen", "cancelled"]) {
      expect(isCardStatus(ok)).toBe(true)
    }
    for (const bad of ["toString", "constructor", "__proto__", "hasOwnProperty", "ACTIVE", ""]) {
      expect(isCardStatus(bad), bad).toBe(false)
    }
  })

  it("keeps a prototype name out of the state machine", () => {
    expect(transitionStatus("active", "constructor")).toEqual({
      ok: false,
      error: "Unknown card status.",
    })
  })
})

describe("transition messages", () => {
  it("reads naturally for an illegal change", () => {
    expect(transitionStatus("frozen", "frozen")).toEqual({
      ok: false,
      error: "Cannot change a card from frozen to frozen.",
    })
  })
})

describe("card history", () => {
  const issuedAt = new Date("2026-08-13T10:00:00.000Z")
  const input: IssueCardInput = {
    nickname: "Ad spend",
    merchantId: "mch_01",
    limit: 25000,
    currency: "USD",
    category: null,
  }

  it("records the issue as the first event, in UTC", () => {
    const { card } = issueCard(input, { random: seeded(5), now: issuedAt })
    expect(card.events).toEqual([
      { at: "2026-08-13T10:00:00.000Z", from: null, to: "active" },
    ])
  })

  it("appends one event per successful change and leaves the original alone", () => {
    const { card } = issueCard(input, { random: seeded(5), now: issuedAt })
    const frozen = applyTransition(card, "frozen", new Date("2026-08-14T09:00:00.000Z"))
    expect(frozen.ok).toBe(true)
    if (!frozen.ok) return

    expect(frozen.card.status).toBe("frozen")
    expect(frozen.card.events).toEqual([
      { at: "2026-08-13T10:00:00.000Z", from: null, to: "active" },
      { at: "2026-08-14T09:00:00.000Z", from: "active", to: "frozen" },
    ])
    expect(card.status).toBe("active")
    expect(card.events).toHaveLength(1)
  })

  it("does not change or record anything for a refused change", () => {
    const { card } = issueCard(input, { random: seeded(5), now: issuedAt })
    const cancelled = applyTransition(card, "cancelled")
    expect(cancelled.ok).toBe(true)
    if (!cancelled.ok) return

    const back = applyTransition(cancelled.card, "active")
    expect(back.ok).toBe(false)
    expect(cancelled.card.events).toHaveLength(2)
  })

  it("rejects a status that is not on the list", () => {
    const { card } = issueCard(input, { random: seeded(5), now: issuedAt })
    expect(applyTransition(card, "closed").ok).toBe(false)
    expect(applyTransition(card, undefined).ok).toBe(false)
  })
})

describe("card-meta", () => {
  it("stays free of the number generator, so client code can import it", async () => {
    const meta = await import("./card-meta")
    expect(Object.keys(meta).sort()).toEqual(
      [
        "AMBER_PERCENT",
        "CARD_CATEGORIES",
        "CARD_CURRENCIES",
        "CATEGORY_LABELS",
        "MAX_LIMIT",
        "MAX_NICKNAME_LENGTH",
        "isNearLimit",
        "maskCardNumber",
        "spendPercent",
      ].sort(),
    )
  })
})
