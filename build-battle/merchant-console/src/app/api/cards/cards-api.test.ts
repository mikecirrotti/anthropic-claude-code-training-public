import { store } from "@/data/store"
import { isValidLuhn } from "@/lib/card"
import { beforeEach, describe, expect, it } from "vitest"
import * as detail from "./[id]/route"
import * as collection from "./route"

/**
 * The card routes run here exactly as the server runs them. These tests lean
 * on the rules the ticket cares about most: validation happens on the server,
 * the full number is returned once, and the state machine cannot be bypassed.
 */

const valid = {
  nickname: "Ad spend",
  merchantId: "mch_01",
  limit: 25000,
  currency: "USD",
}

function post(body: unknown, raw = false) {
  return collection.POST(
    new Request("http://localhost/api/cards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: raw ? (body as string) : JSON.stringify(body),
    }),
  )
}

function patch(id: string, body: unknown, raw = false) {
  return detail.PATCH(
    new Request(`http://localhost/api/cards/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: raw ? (body as string) : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  )
}

const getOne = (id: string) =>
  detail.GET(new Request(`http://localhost/api/cards/${id}`), {
    params: Promise.resolve({ id }),
  })

async function issue(body: unknown = valid) {
  const response = await post(body)
  expect(response.status).toBe(201)
  return (await response.json()) as {
    card: { id: string; status: string; events: unknown[] }
    number: string
  }
}

beforeEach(() => {
  store.cards.length = 0
})

describe("POST /api/cards", () => {
  it("issues a card and returns the full number once, with no caching", async () => {
    const response = await post(valid)
    expect(response.status).toBe(201)
    expect(response.headers.get("cache-control")).toBe("no-store")

    const { card, number } = await response.json()
    expect(number).toMatch(/^4242\d{12}$/)
    expect(isValidLuhn(number)).toBe(true)
    expect(card).toMatchObject({
      nickname: "Ad spend",
      merchantId: "mch_01",
      limit: 25000,
      currency: "USD",
      status: "active",
      last4: number.slice(-4),
    })
  })

  it("stores the card without the number", async () => {
    const { number } = await issue()
    expect(store.cards).toHaveLength(1)
    expect(JSON.stringify(store.cards)).not.toContain(number)
  })

  it("never shows the number again: not in the list, not in the detail", async () => {
    const { card, number } = await issue()

    const list = await (await collection.GET()).text()
    const one = await (await getOne(card.id)).text()

    expect(list).not.toContain(number)
    expect(one).not.toContain(number)
    expect(list).toContain(number.slice(-4))
  })

  it("rejects each invalid request with 400 and stores nothing", async () => {
    const cases: [string, Record<string, unknown>][] = [
      ["missing merchant", { ...valid, merchantId: undefined }],
      ["unknown merchant", { ...valid, merchantId: "mch_999" }],
      ["zero limit", { ...valid, limit: 0 }],
      ["negative limit", { ...valid, limit: -500 }],
      ["limit over 5,000,000", { ...valid, limit: 5_000_001 }],
      ["fractional limit", { ...valid, limit: 250.5 }],
      ["string limit", { ...valid, limit: "$250.00" }],
      ["currency outside the list", { ...valid, currency: "JPY" }],
      ["currency that is not the merchant's own", { ...valid, currency: "EUR" }],
      ["missing nickname", { ...valid, nickname: "" }],
    ]
    for (const [label, body] of cases) {
      const response = await post(body)
      expect(response.status, label).toBe(400)
      const payload = await response.json()
      expect(payload.error, label).toEqual(expect.any(String))
      expect(payload).not.toHaveProperty("number")
    }
    expect(store.cards).toHaveLength(0)
  })

  it("says which field is wrong", async () => {
    const response = await post({ ...valid, limit: 0, currency: "JPY" })
    const payload = await response.json()
    expect(Object.keys(payload.fields).sort()).toEqual(["currency", "limit"])
  })

  it("accepts the largest allowed limit", async () => {
    expect((await post({ ...valid, limit: 5_000_000 })).status).toBe(201)
  })

  it("answers malformed JSON with 400, not a server error", async () => {
    const response = await post("{not json", true)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: "Request body must be valid JSON.",
    })
  })
})

describe("GET /api/cards", () => {
  it("lists issued cards, newest first", async () => {
    const first = await issue({ ...valid, nickname: "First" })
    const second = await issue({ ...valid, nickname: "Second" })

    const { rows, total } = await (await collection.GET()).json()
    expect(total).toBe(2)
    expect(rows.map((c: { id: string }) => c.id)).toEqual([
      second.card.id,
      first.card.id,
    ])
  })

  it("returns an empty list, not an error, when nothing is issued", async () => {
    expect(await (await collection.GET()).json()).toEqual({ rows: [], total: 0 })
  })
})

describe("GET /api/cards/[id]", () => {
  it("returns the card", async () => {
    const { card } = await issue()
    const response = await getOne(card.id)
    expect(response.status).toBe(200)
    expect((await response.json()).card.id).toBe(card.id)
  })

  it("answers an unknown card with 404", async () => {
    const response = await getOne("card_nope")
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: "Card not found." })
  })
})

describe("PATCH /api/cards/[id]", () => {
  it("freezes and unfreezes, recording each change", async () => {
    const { card } = await issue()

    const frozen = await patch(card.id, { status: "frozen" })
    expect(frozen.status).toBe(200)
    expect((await frozen.json()).card.status).toBe("frozen")

    const active = await patch(card.id, { status: "active" })
    expect(active.status).toBe(200)
    const body = await active.json()
    expect(body.card.status).toBe("active")
    expect(body.card.events).toHaveLength(3)
    expect(store.cards[0].status).toBe("active")
  })

  it("refuses to bring a cancelled card back, and leaves it unchanged", async () => {
    const { card } = await issue()
    expect((await patch(card.id, { status: "cancelled" })).status).toBe(200)

    for (const status of ["active", "frozen", "cancelled"]) {
      const response = await patch(card.id, { status })
      expect(response.status, status).toBe(409)
      expect(await response.json()).toEqual({
        error: expect.stringContaining("cancelled"),
      })
    }
    expect(store.cards[0].status).toBe("cancelled")
    expect(store.cards[0].events).toHaveLength(2)
  })

  it("refuses a change to the status it already has", async () => {
    const { card } = await issue()
    expect((await patch(card.id, { status: "active" })).status).toBe(409)
    expect(store.cards[0].events).toHaveLength(1)
  })

  it("rejects a status that is not on the list with 400", async () => {
    const { card } = await issue()
    for (const status of ["closed", "constructor", "", null, 7]) {
      expect((await patch(card.id, { status })).status, String(status)).toBe(400)
    }
    expect((await patch(card.id, {})).status).toBe(400)
    expect((await patch(card.id, "{bad", true)).status).toBe(400)
    expect(store.cards[0].status).toBe("active")
  })

  it("answers an unknown card with 404", async () => {
    expect((await patch("card_nope", { status: "frozen" })).status).toBe(404)
  })
})
