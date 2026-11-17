# SPEC · NWP-102 — Merchant daily totals do not match settlement statements

> Written before any code. Diagnosis from a read-only investigation: six investigators, then eight refuters that tried to disprove each suspected cause. No code was changed.
> Load it as context when you build: `@docs/specs/NWP-102-daily-totals-diagnosis.md`

**Ticket:** [NWP-102](../tickets/NWP-102.md)
**Author:** Claude Code (investigation); owner and reviewer not yet assigned
**Status:** draft

## Problem

Three merchants say the dashboard's daily volume does not match their settlement statement. Two are off by a few cents on high-volume days, one in Berlin sees a whole day on the wrong date, and a refund-heavy merchant sees totals that look too high. Support could not reproduce any of it. Merchants are comparing against statements, so a wrong number is a support ticket and, for finance, a trust problem.

## Current state

The ticket asks which of the three reports share a cause. Four causes survived refutation, and one report has none. Report A does not trace to any of them, so the reports do not share a cause, and A is still open.

| # | Cause | Where | Explains |
| --- | --- | --- | --- |
| 1 | Daily buckets are keyed with `toLocaleDateString("en-CA")`, which uses the server's timezone, while the bucket keys are UTC. | `src/data/metrics.ts:25` (keys from `src/lib/dates.ts:39-47`) | **B**, only if the server is not on UTC |
| 2 | Merchant-facing tables show UTC dates through `formatDate`. Only the payment detail page uses the merchant's zone. `dayKeyInZone` is unused in the app. | `src/app/payments/page.tsx:132`, `src/app/payouts/page.tsx:81-82`, `src/app/disputes/page.tsx:70,73`, `src/lib/dates.ts:12,31-36`, `src/app/payments/[id]/page.tsx:75` | **B**, the best fit for a Berlin merchant |
| 3 | "Gross volume" is captured plus the full amount of every refunded payment. | `src/data/metrics.ts:53-55`, shown at `src/app/overview/page.tsx:29` | **C**, partly |
| 4 | The daily Refunded series uses the payment's date and full amount, not the Refund record's. Refunds are dated 1-6 days later and 30% are partial. | `src/data/metrics.ts:33-35`, `src/data/generate.ts:107-123` | **C**, partly |

- **Cause 1** was reproduced in isolation: with `TZ=Europe/Berlin` a 22:30 UTC payment lands on the next day, with `TZ=America/New_York` a 00:30 UTC payment lands on the previous day, and with UTC nothing moves. It depends on the host, not the merchant. Its only consumer is the aggregate ops overview (`src/app/overview/page.tsx:12`), which a merchant does not see. Outside the 30-day window a payment is dropped (`metrics.ts:27`).
- **Cause 2** is also a design question: `src/lib/dates.ts:30` documents UTC tables as deliberate.
- **Causes 3 and 4** are platform-wide figures. The merchants and payouts screens count captured volume only (`src/data/analytics.ts:110,119`, `src/data/generate.ts:165-174`), so neither is something one merchant sees as "too high" today.

**Refuted, so not to be fixed as part of this ticket:**

- **Float accumulation as the cents cause** (`src/data/metrics.ts:31,34,42-43`). It breaks the integer rule, but the final `Math.round` absorbs the drift: an error bound of about 1e-9 cents for 9-19 payments a day, and zero mismatches in a 2.2 million trial simulation up to 300,000 payments per bucket.
- **Whole-dollar chart rounding** (`src/app/overview/volume-chart.tsx:17-19`, `src/data/analytics.ts:54-58`). It does not grow with transaction count, and per-merchant screens show cents.
- **Payouts versus payments.** Payouts use weekly windows and captured-only payments, and are generated at seed time (`src/data/generate.ts:150-185`).
- **Per-batch payout fee rounding** (`src/data/generate.ts:175`). It rests on a statement rule that nothing in the repo states.

## Domain rules

| Rule | Source | What breaks if ignored |
| --- | --- | --- |
| "Storage and bucketing are UTC. Display converts to the merchant's timezone. Nothing else does." | `CLAUDE.md` convention 2 | Volume lands on the wrong day |
| "Grouping by the server's local calendar is a violation, whatever timezone the server happens to be in." | `docs/ORG-STANDARDS.md` #4 | Same, and it only shows on non-UTC hosts |
| "Gross, net, fees, and refunds reconcile; a number shown twice is derived once." | `docs/ORG-STANDARDS.md` #3 | The overview, merchants and payouts screens disagree |
| "Summing across currencies without converting is a bug even when the number looks right." | `.claude/rules/money.md` | Ops totals are mixed currencies labelled USD |

## Approach

Treat causes 1, 3 and 4 as code fixes and cause 2 as a decision first. Bucket with the existing `utcDayKey` instead of local time. Decide once what "gross volume" means and use that single definition on the overview, merchants and payouts screens. Build the refunded series from `store.refunds`, using each refund's own amount and UTC date. For cause 2, product decides whether tables should show merchant-local dates. If yes, route the list, payouts and disputes through `formatInZone` or `dayKeyInZone`. If not, label the displayed dates as UTC.

**Considered and rejected:**

- Fixing the float accumulation as the cents cause. It is refuted, and changing it would suggest the cents report is solved when it is not. It is worth doing separately as a rule cleanup.
- Adding per-merchant day bucketing now. No evidence ties a reported symptom to it, and it needs a product decision first.

## File map

| File | Add or change | Why |
| --- | --- | --- |
| `src/data/metrics.ts` | Change | Causes 1, 3 and 4 |
| `src/lib/dates.ts` | Reuse | `utcDayKey` and `dayKeyInZone` already exist |
| `src/app/payments/page.tsx`, `src/app/payouts/page.tsx`, `src/app/disputes/page.tsx` | Change, only if product chooses merchant-local dates | Cause 2 |
| `src/lib/dates.test.ts`, a new metrics test beside `src/data/metrics.ts` | Add | Pin the day boundary and the refund handling |

## Plan

1. **Get the facts that decide scope** — done when: the server timezone, the three merchants' IDs and the screens they used are recorded in this spec.
2. **Bucket by UTC day** — done when: a test shows a 22:30 UTC and a 00:30 UTC payment land on their UTC day regardless of `TZ`.
3. **Define gross once** — done when: the overview, merchants and payouts screens agree on the same figure for the same period, per currency.
4. **Build the refunded series from Refund records** — done when: a partial refund appears at its refund amount on its refund day.
5. **Decide cause 2** — done when: product has said UTC or merchant-local for tables, and the code or labels match.

## Verification

The ticket lists no acceptance criteria, so each reported symptom is the check.

| Report | How it is proven |
| --- | --- |
| B, wrong date | Run the daily series under `TZ=UTC`, `TZ=Europe/Berlin` and `TZ=America/New_York` and confirm identical output; compare a Berlin merchant's list and detail pages once cause 2 is decided |
| C, totals too high | Reconcile gross, captured and refunded for one refund-heavy merchant against the Refund records |
| A, cents | Not yet provable: no cause is known. Needs the statements' rounding rule and a merchant-level comparison |

## Risks

- Fixing 1 to 4 and reporting the ticket resolved while A stays open. This spec marks A as unexplained on purpose.
- Changing the definition of gross is a visible number change for ops. Announce it.
- Cause 2 touches three screens and may change what merchants have been reading.

## Out of scope

- Float accumulation in `dailyVolume` (`src/data/metrics.ts:31,34`). It violates the money rule but changes no total. Fix it as a separate cleanup.
- Mixed-currency sums labelled USD on the ops overview (`src/data/metrics.ts:29-35,53-55,73`, `src/data/analytics.ts:54,73`). It needs an FX or per-currency product decision. No rate source exists in the repo.
- `sortPayments` comparing amounts as strings (`src/data/queries.ts:81`). It affects ordering only.
- `from` and `to` filters compared as raw strings (`src/data/queries.ts:52-53`).

## Open questions

- What timezone does the server run in? It decides whether cause 1 changes anything in practice.
- Which screens did the three merchants compare, and against which statement? Only a per-merchant screen can be compared with a settlement statement.
- How do the settlement statements round fees and totals? That is the only remaining lead for report A.
- Should "gross volume" include refunded payments? Nothing in the repo defines it.
- Should merchant-facing tables show UTC or merchant-local dates?
