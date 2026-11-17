import { describe, expect, it } from "vitest"
import { AMBER_PERCENT, isNearLimit, maskCardNumber, spendPercent } from "./card-meta"

describe("isNearLimit", () => {
  it("is not amber at exactly 80% of the limit", () => {
    expect(AMBER_PERCENT).toBe(80)
    expect(isNearLimit(20000, 25000)).toBe(false)
  })

  it("turns amber the moment spend passes 80%", () => {
    expect(isNearLimit(20001, 25000)).toBe(true)
  })

  it("counts 80.5% even though it displays as 80", () => {
    expect(spendPercent(20125, 25000)).toBe(80)
    expect(isNearLimit(20125, 25000)).toBe(true)
  })

  it("is amber when the limit is exceeded and clear when nothing is spent", () => {
    expect(isNearLimit(30000, 25000)).toBe(true)
    expect(isNearLimit(0, 25000)).toBe(false)
  })

  it("never fires for a limit that is not positive", () => {
    expect(isNearLimit(100, 0)).toBe(false)
    expect(isNearLimit(100, -5)).toBe(false)
  })
})

describe("spendPercent", () => {
  it("gives a whole percent of the limit", () => {
    expect(spendPercent(0, 25000)).toBe(0)
    expect(spendPercent(12500, 25000)).toBe(50)
    expect(spendPercent(25000, 25000)).toBe(100)
  })

  it("clamps overspend to 100 and a bad limit to 0", () => {
    expect(spendPercent(99999, 25000)).toBe(100)
    expect(spendPercent(100, 0)).toBe(0)
  })
})

describe("maskCardNumber", () => {
  it("shows only the last four", () => {
    expect(maskCardNumber("4242")).toBe("•••• 4242")
  })
})
