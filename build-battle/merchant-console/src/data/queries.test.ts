import { describe, expect, it } from "vitest"
import { sortPayments } from "./queries"
import { Payment } from "./types"

/**
 * sortPayments backs GET /api/payments and the CSV export. Amounts are integer
 * minor units, so they have to be ordered as numbers: compared as text,
 * "900" ranks above "10000" because "9" sorts after "1".
 */

function payment(id: string, amount: number, createdAt: string): Payment {
  return {
    id,
    merchantId: "mch_01",
    amount,
    currency: "USD",
    status: "captured",
    method: "card",
    cardBrand: "visa",
    last4: "4242",
    createdAt,
    description: id,
  }
}

const payments = [
  payment("p_900", 900, "2026-03-01T00:00:00.000Z"),
  payment("p_10000", 10000, "2026-03-02T00:00:00.000Z"),
  payment("p_5", 5, "2026-03-03T00:00:00.000Z"),
  payment("p_48000", 48000, "2026-03-04T00:00:00.000Z"),
  payment("p_250", 250, "2026-03-05T00:00:00.000Z"),
]

describe("sortPayments by amount", () => {
  it("puts the largest amount first when descending, whatever its digits", () => {
    const ids = sortPayments(payments, "amount", "desc").map((p) => p.id)
    expect(ids).toEqual(["p_48000", "p_10000", "p_900", "p_250", "p_5"])
  })

  it("puts the smallest amount first when ascending", () => {
    const ids = sortPayments(payments, "amount", "asc").map((p) => p.id)
    expect(ids).toEqual(["p_5", "p_250", "p_900", "p_10000", "p_48000"])
  })

  it("keeps the input order for equal amounts", () => {
    const ties = [
      payment("first", 700, "2026-03-01T00:00:00.000Z"),
      payment("second", 700, "2026-03-02T00:00:00.000Z"),
    ]
    expect(sortPayments(ties, "amount", "desc").map((p) => p.id)).toEqual([
      "first",
      "second",
    ])
  })

  it("does not reorder or mutate the array it was given", () => {
    const before = payments.map((p) => p.id)
    sortPayments(payments, "amount", "desc")
    expect(payments.map((p) => p.id)).toEqual(before)
  })
})

describe("sortPayments by date", () => {
  it("defaults to newest first", () => {
    const ids = sortPayments(payments).map((p) => p.id)
    expect(ids).toEqual(["p_250", "p_48000", "p_5", "p_10000", "p_900"])
  })
})
