# SPEC · NWP-201 — Issue virtual cards from the console

> Written before any code, then updated after the build so it matches what shipped. Departures from the first plan are listed under Approach.
> Load it as context when you build: `@docs/specs/NWP-201-issue-cards.md`

**Ticket:** [NWP-201](../tickets/NWP-201.md)
**Author:** Claude Code, with the engineer
**Status:** building (code complete; ship checks and PR still to do)

## Problem

Ops issues virtual cards by messaging the platform team, who create them by hand. It takes hours, happens twelve to twenty times a week, and last month two cards went out with the wrong spend limit because the request lived in a Slack thread. Ops needs to issue a card, see the cards they have issued, and open one to check it, in the console and with a limit from the moment it exists.

## Current state

As found on `main` (da19f40), before this work. Nothing card-related existed.

- `CLAUDE.md` (Layout) — "Cards is NWP-201 and does not exist yet". `src/app/` had overview, payments, disputes and payouts only.
- `src/data/types.ts` — `Merchant`, `Payment`, `Refund`, `Dispute`, `Payout`, no `Card`. `Payment` has `last4` and `cardBrand`, but nothing links a payment to a card.
- `src/data/store.ts` — the in-memory `Store`, built by `createStore()` and held on `globalThis`.
- `src/data/queries.ts` — the allowlist pattern for client input (`parseFilters`). `src/app/api/payments/route.ts` was a GET only, so there was no POST or validation example; `.claude/rules/api-routes.md` was the guide.
- `src/data/merchants.ts` — ten merchants, each with a `currency` and `timezone`.
- `src/lib/money.ts` — `formatMoney` and `parseAmountToMinorUnits`. `src/lib/dates.ts` — `formatInZone` and `formatDate`.
- `src/components/Drawer.tsx` (Radix dialog wrappers), `Button`, `Input`, `Select`, `Badge`. There is no Dialog or Checkbox component.
- `src/components/ui/payments/StatusBadge.tsx`, `src/app/siteConfig.ts`, `src/components/ui/navigation/AppSidebar.tsx` and `Breadcrumbs.tsx` — the nav and badge pieces that needed a card entry.
- `vitest.config.ts` — Node environment only, `src/**/*.test.ts`, so there are no UI tests and logic must be pure functions.
- `.claude/rules/cards.md` loads for `src/**/card*.ts`, `src/**/card*.tsx` and `src/**/cards/**`.

**Gaps the ticket does not mention:** "spend against the limit" has no data source, and the ticket asks to store "the generated number's reference", so a record carries a reference and last four, never the number.

## Domain rules

| Rule | Source | What breaks if ignored |
| --- | --- | --- |
| "Money is integer minor units. `$250.00` is `25000`." | `CLAUDE.md` convention 1 | Limits and spend drift |
| "Anything from the client — column names, currencies, limits, statuses — is checked against an allowlist before it reaches a query, a filename, or the store." | `CLAUDE.md` convention 4 | A bad limit or currency reaches the store |
| "Generated numbers use the `4242` test BIN and a valid Luhn check digit. Nothing here may resemble a real PAN." | `CLAUDE.md` Card rules | A real-looking number |
| "The full number is returned exactly once, in the creation response. After that, last four only." | `CLAUDE.md` Card rules | A re-readable number leaks |
| "Card numbers are masked everywhere except the single creation response. Stored records carry the last four and a reference, never the number." | `docs/ORG-STANDARDS.md` #8 | Persisting a number |
| "Status is a state machine: `active ⇄ frozen`, either to `cancelled`, and `cancelled` is terminal." / "Guard the transition on the server, not only in the UI." | `CLAUDE.md`, `.claude/rules/cards.md` | A direct request bypasses the UI |
| Reject a missing merchant, a limit of zero or less, a limit above 5,000,000 minor units, and a currency outside USD, EUR, GBP | NWP-201 core criteria | The server trusts the client |
| Storage is UTC; display converts to the merchant's timezone | `CLAUDE.md` convention 2 | Wrong created date |

**Decisions:** the server accepts only USD, EUR and GBP, as the ticket says, and `validateIssueRequest` in `src/lib/card.ts` also rejects a currency that is not the chosen merchant's own (`currency` in `src/data/merchants.ts`), because a card spends against that merchant's balance. The form defaults the currency to the merchant's own and flags a mismatch before it is sent. A nickname is required (up to 60 characters). Categories are software, advertising, contractors, travel and general. A reference is an opaque `ref_` plus 16 random characters, unrelated to the number.

## Approach

Server first. Card logic lives in pure functions in `src/lib/card.ts`: a Luhn generator on the 4242 BIN with an injectable random source, request validation that reports every field error at once, the status state machine, `applyTransition`, and `issueCard`, which returns the record and the number separately so the record has nowhere to keep it. Route handlers wrap those functions. The UI is built on the existing `Drawer`, `Button`, `Input` and `Select`: a `/cards` list, an issue form with a one-time success screen, and a detail page.

**Departures from the first plan:**
- **Status history.** `Card` carries an `events` list (an entry on issue and on each change), so a card shows what happened to it and when. The detail page renders it in the merchant's timezone.
- **Client-safe split.** Limits, currencies, categories, the mask helper and the spend helpers live in `src/lib/card-meta.ts`, which client code imports instead of `card.ts`, so the generator never ships to the browser.
- **Shared accessors.** `listCards` and `cardById` in `src/data/queries.ts` serve both the pages and the routes, so the logic is not duplicated.
- **No seeded cards.** `src/data/generate.ts` is unchanged. The store starts empty.
- **Cancel** is on the detail page, behind a two-step confirm. Freeze and unfreeze are on the list and the detail page.

**Considered and rejected:**
- Generating or holding the number in the browser, or storing it and masking at render. Either breaks reveal-once.
- Deriving spend from payments. Nothing links a payment to a card, so any derivation would be invented. A stored `spent` field, always 0, is honest about that.

## File map

| File | Add or change | Why |
| --- | --- | --- |
| `src/data/types.ts` | Change | `CardStatus`, `CardCategory`, `CardEvent`, `Card` |
| `src/data/store.ts` | Change | A `cards` field, with a guard for a store cached before it existed |
| `src/data/queries.ts` | Change | `listCards`, `cardById` |
| `src/lib/card.ts`, `src/lib/card.test.ts` | Add | Generator, validation, state machine, `issueCard`, and their tests |
| `src/lib/card-meta.ts`, `src/lib/card-meta.test.ts` | Add | Client-safe constants and spend helpers, and the amber-edge tests |
| `src/app/api/cards/route.ts`, `[id]/route.ts`, `responses.ts` | Add | Issue, list, detail, status change, and one error shape |
| `src/app/api/cards/cards-api.test.ts` | Add | The handlers run against the store |
| `src/app/cards/page.tsx`, `issue-card.tsx`, `card-actions.tsx` | Add | The list, the issue form with one-time reveal, and the row actions |
| `src/app/cards/[id]/page.tsx`, `[id]/not-found.tsx` | Add | Detail with spend and history, and a written 404 |
| `src/app/siteConfig.ts`, `AppSidebar.tsx`, `Breadcrumbs.tsx`, `StatusBadge.tsx` | Change | Nav entry, breadcrumb label, card statuses |

## Plan

Each step ended somewhere checkable. Status as of the last commit:

1. **Types, store field, `card.ts` with tests** — done: 35 tests cover Luhn, the BIN, every limit and currency rule, and all nine status pairs.
2. **API routes** — done: handlers tested in-process and checked with `curl` over HTTP.
3. **Read the diff against the rules** — done: no `console.*`, floats, or second query path; the number appears only in the issue response.
4. **List, issue form, success screen, nav** — done, checked in the browser.
5. **Detail page** — done.
6. **Stretch** — done: unit tests, freeze/unfreeze without a reload, the amber bar, written empty and error states, and the category lock.
7. **Ship** — to do: `/ship-ready`, the org-standards review, the PR description, push.

## Verification

87 tests pass (35 in `card.test.ts`, 8 in `card-meta.test.ts`, 16 in `cards-api.test.ts`, 28 existing), and `tsc`, lint and `npm run build` are clean. In the build, `/cards` and `/cards/[id]` are dynamic.

| Acceptance criterion | How it is proven |
| --- | --- |
| Issue a card | Filled the form in the browser; the card appeared in `/cards` |
| Card list | All columns checked, including the masked number and the written empty state |
| Card detail | Record, spend and history shown; unknown id gives a written 404 |
| Generated numbers | Tests across 500 generations, plus a live card: 4242 prefix, 16 digits, Luhn valid |
| Reveal once, mask forever | After Done, the number is absent from the DOM, storage and URL. Only one `POST /api/cards` carried it. It is absent from the list, detail and page HTML, and from all 40 client bundles |
| Server-side validation | Tests and `curl`: no merchant, 0, -1, 5,000,001, `"$250.00"`, `JPY` and bad JSON all return 400; 5,000,000 is accepted |
| State machine | Tests and `curl`: illegal changes and anything from `cancelled` return 409, unknown status 400, unknown id 404 |
| Freeze and unfreeze | Done in the browser with no full reload |
| Spend bar, amber past 80% | `card-meta.test.ts` covers the edges. It has not been seen on screen, because spend is always 0 |

## Risks

- **Spend never changes.** Nothing records it, so every card shows 0% and the amber rule is proven by tests only.
- **Double submit** is guarded in the UI (an in-flight ref and a disabled button) but not on the server. A retry after a lost response could issue a second card.
- **Closing mid-request.** The response is dropped so no number appears in a form the user left. The card still exists, but its number was never shown.
- **The category lock** is chosen at issue and displayed, but not enforced, because there is no spend to enforce it against.
- **Not tested:** a keyboard-only pass through the selects, and a screen reader.

## Out of scope

- Persistence (NWP-203), authentication, real card-network calls, and editing a limit after issue (NWP-202), all per the ticket.

## Open questions

- Should spend be recorded somewhere? Until then it stays at 0.
- Should the category lock be enforced, and against what?
- Should issuing be idempotent on the server?
- If a number is lost, is cancel and re-issue the answer?
