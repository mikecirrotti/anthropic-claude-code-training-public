# SPEC · NWP-201 — Issue virtual cards from the console

> Written before any code. Generated with `/spec`, then edited by a human.
> Load it as context when you build: `@docs/specs/NWP-201-issue-cards.md`

**Ticket:** [NWP-201](../tickets/NWP-201.md)
**Author:** Claude Code, with the engineer
**Status:** draft

## Problem

Ops issues virtual cards by messaging the platform team, who create them by hand. It takes hours, happens twelve to twenty times a week, and last month two cards went out with the wrong spend limit because the request lived in a Slack thread. Ops needs to issue a card, see the cards they have issued, and open one to check it, in the console and with a limit from the moment it exists.

## Current state

Nothing card-related exists yet, so every file below is new or an existing file that needs a card-shaped addition.

- `CLAUDE.md` (Layout) — "Cards is NWP-201 and does not exist yet". `src/app/` has overview, payments, disputes and payouts only.
- `src/data/types.ts:14-72` — `Merchant`, `Payment`, `Refund`, `Dispute`, `Payout`. No `Card` type. `Payment` already has `last4` and `cardBrand` (`:32-33`), but nothing links a payment to a card.
- `src/data/store.ts:16-22,29-38` — the in-memory `Store` interface, built by `createStore()` and held on `globalThis`. Cards need a field here so they survive hot reload.
- `src/data/generate.ts:16-35,55` — deterministic seed (`rand`, `pick`, `between`, `pad`). Demo cards would be seeded here.
- `src/data/queries.ts:5-36` — the allowlist pattern for client input (`parseFilters`). `src/app/api/payments/route.ts:4-7` is a GET only, so there is no POST or validation example to copy; follow `.claude/rules/api-routes.md` (validate against an allowlist, reject early, one error shape).
- `src/data/merchants.ts:7-90` — ten merchants, each with a `currency` and `timezone`, and `merchantById`.
- `src/lib/money.ts:15,41,46` — `formatMoney`, `sumMinorUnits`, and `parseAmountToMinorUnits` (boundary parse of "250.00" into 25000). Use these. Do not write a second formatter.
- `src/lib/dates.ts:22,31` — `formatInZone` (merchant timezone, for detail) and `formatDate` (UTC, for tables).
- `src/components/Drawer.tsx:185-195` — Radix dialog wrappers. There is no Dialog or Checkbox component. `Button`, `Input`, `Select` (`Select.tsx:253`) and `Badge` exist.
- `src/components/ui/payments/StatusBadge.tsx:5-37` — keyed to payment, dispute and payout statuses, so card statuses need adding.
- `src/app/siteConfig.ts:5-10` and `src/components/ui/navigation/AppSidebar.tsx:29-47` — nav entries; Cards needs one.
- `src/app/payments/[id]/page.tsx:40-60` — the detail-page layout to match.
- `vitest.config.ts` — Node environment only, `src/**/*.test.ts`. There are no UI tests, so card logic must be pure functions that tests can reach.
- `.claude/rules/cards.md` loads for `src/**/card*.ts`, `src/**/card*.tsx` and `src/**/cards/**`, so name the new files to match.

**Gaps the ticket does not mention:**
- "Spend against the limit" has no data source: nothing in the codebase attributes spend to a card.
- The ticket asks to store "the generated number's reference", so the record carries a reference and last four, never the number.

## Domain rules

| Rule | Source | What breaks if ignored |
| --- | --- | --- |
| "Money is integer minor units. `$250.00` is `25000`." | `CLAUDE.md` convention 1 | Limits and spend drift or mis-format |
| "Anything from the client — column names, currencies, limits, statuses — is checked against an allowlist before it reaches a query, a filename, or the store." | `CLAUDE.md` convention 4 | A bad limit or currency reaches the store |
| "Generated numbers use the `4242` test BIN and a valid Luhn check digit. Nothing here may resemble a real PAN." | `CLAUDE.md` Card rules | A real-looking number in the repo |
| "The full number is returned exactly once, in the creation response. After that, last four only." | `CLAUDE.md` Card rules | A re-readable number leaks |
| "Card numbers are masked everywhere except the single creation response. Stored records carry the last four and a reference, never the number." | `docs/ORG-STANDARDS.md` #8 | Persisting a number |
| "Status is a state machine: `active ⇄ frozen`, either to `cancelled`, and `cancelled` is terminal." | `CLAUDE.md`, ticket rule 3 | Cancelled cards come back |
| "Guard the transition on the server, not only in the UI." | `.claude/rules/cards.md` | A direct request bypasses the UI |
| Reject a missing merchant, a limit of zero or less, a limit above 5,000,000 minor units, and a currency outside USD, EUR, GBP | NWP-201 core criteria | The server trusts the client |
| Storage is UTC; display converts to the merchant's timezone | `CLAUDE.md` convention 2 | Wrong created date |

**Decision:** the server accepts any of USD, EUR, GBP, as the ticket says. The form defaults the currency to the merchant's own and warns on a mismatch.

## Approach

Server first. Put the card logic in pure functions under `src/lib/card*.ts`: a Luhn generator on the `4242` BIN with an injectable random source so tests are deterministic, one validator for the issue request, and the status transition table. Add a `Card` type, a `cards` field on the store, and route handlers for issue, list, detail and status change. Issue returns the number once. Everything else returns the last four only. Then build the UI on the existing `Drawer`, `Button`, `Input` and `Select`: a `/cards` list, an issue form with a one-time success screen, and a detail page.

**Considered and rejected:**
- Generating or holding the number in the browser, or storing it and masking at render. Either breaks reveal-once and makes the number re-readable.
- Deriving spend from payments. Nothing links a payment to a card, so any derivation would be invented. A stored `spent` field is honest about that.

## File map

| File | Add or change | Why |
| --- | --- | --- |
| `src/data/types.ts` | Change | `Card`, `CardStatus`, and a category type |
| `src/data/store.ts`, `src/data/generate.ts` | Change | A `cards` field, plus a few seeded demo cards |
| `src/lib/card.ts` | Add | Luhn generator, request validation, transition table |
| `src/lib/card.test.ts` | Add | Luhn, BIN, validation limits, every transition |
| `src/app/api/cards/route.ts` | Add | `POST` issue and `GET` list |
| `src/app/api/cards/[id]/route.ts` | Add | `GET` detail and `PATCH` status change |
| `src/app/cards/page.tsx`, `src/app/cards/issue-card.tsx` | Add | List and the issue form with the one-time reveal |
| `src/app/cards/[id]/page.tsx` | Add | Detail with spend against the limit |
| `src/components/ui/payments/StatusBadge.tsx`, `siteConfig.ts`, `AppSidebar.tsx` | Change | Card statuses and the nav entry |

## Plan

1. **Types, store field and `src/lib/card.ts` with tests** — done when `npm test` passes and covers Luhn validity, the `4242` prefix, each limit and currency rule, and every allowed and forbidden transition.
2. **Card API routes** — done when `curl` shows a valid issue returns the number once, list and detail never contain it, invalid input gets a 400, and `cancelled` to `active` is refused.
3. **Stop and read the diff** — done when minor units, server-side validation and number handling are checked against the rules above.
4. **List page, issue form, success screen, nav entry** — done when issuing in the browser shows the number once and the list then shows `•••• 4242`.
5. **Detail page** — done when it shows the full record and spend against the limit.
6. **Stretch, in order:** unit tests (done in step 1), freeze and unfreeze without a reload, an amber bar past 80%, written empty and error states, then the category lock.
7. **Ship** — run `/ship-ready` and the org-standards review, write the PR description, push.

## Verification

| Acceptance criterion | How it is proven |
| --- | --- |
| Issue a card | Submit the form; the card appears in `/cards` |
| Card list | Open `/cards`; check all six columns |
| Card detail | Open a card; check the record and the spend |
| Generated numbers | Unit test: prefix `4242`, length 16, Luhn valid across many generations |
| Reveal once, mask forever | `curl` the list and detail and grep for the number; check the store record has no number field |
| Server-side validation | `curl` each bad case (no merchant, 0, -1, 5,000,001, currency `JPY`) and expect 400 |
| State machine | Unit test the table; `curl` an illegal transition and expect a refusal |

## Risks

- The number could leak through the success screen's client state, a log line or a test fixture. Keep it in one response only, and clear it on close.
- Time. If the clock runs short, stop at the core six and the Luhn and transition tests.
- Tests can only reach pure functions, so keep logic out of components.

## Out of scope

- Persistence (NWP-203), authentication, real card-network calls, and editing a limit after issue (NWP-202), all per the ticket.

## Open questions

- Spend source: assumed a stored `spent` field in minor units, with a few seeded cards so the progress bar can be shown. Not confirmed.
- Which merchant categories the lock offers. The ticket does not list them.
- What the card reference looks like. Assumed an opaque ID unrelated to the number.
