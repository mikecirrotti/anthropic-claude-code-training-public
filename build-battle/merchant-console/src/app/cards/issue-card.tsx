"use client"

import { Button } from "@/components/Button"
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/Drawer"
import { Input } from "@/components/Input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/Select"
import { Card, Currency } from "@/data/types"
import {
  CARD_CATEGORIES,
  CARD_CURRENCIES,
  CATEGORY_LABELS,
  MAX_LIMIT,
  MAX_NICKNAME_LENGTH,
  maskCardNumber,
} from "@/lib/card-meta"
import { formatMoney, parseAmountToMinorUnits } from "@/lib/money"
import { Plus } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

/**
 * The issue form. It talks to POST /api/cards and holds the returned number in
 * component state only, long enough for the success screen. Nothing here writes
 * it to a URL, storage or the console, and every path that closes the drawer
 * clears it. Client code imports card-meta, never the number generator.
 */

interface MerchantOption {
  id: string
  name: string
  currency: Currency
}

const NO_CATEGORY = "none"

const labelClass = "text-sm font-medium text-gray-900 dark:text-gray-50"
const hintClass = "mt-1 text-xs text-gray-500"
const errorClass = "mt-1 text-xs text-red-600 dark:text-red-500"

type FieldErrors = Partial<Record<string, string>>

export function IssueCard({ merchants }: { merchants: MerchantOption[] }) {
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [nickname, setNickname] = useState("")
  const [merchantId, setMerchantId] = useState("")
  const [limitText, setLimitText] = useState("")
  const [currency, setCurrency] = useState<Currency>("USD")
  const [category, setCategory] = useState(NO_CATEGORY)
  const [pending, setPending] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<{ number: string; card: Card } | null>(
    null,
  )
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle")

  // A ref as well as `pending`: two quick clicks can both land before React
  // re-renders the disabled button.
  const inFlight = useRef(false)
  // Bumped on close, so a response that arrives after the drawer closed is
  // dropped instead of showing a number in a form the user has left.
  const session = useRef(0)
  const doneRef = useRef<HTMLButtonElement>(null)

  const merchant = merchants.find((m) => m.id === merchantId)
  const currencyMismatch = merchant && merchant.currency !== currency

  useEffect(() => {
    // The submit button unmounts on success, so move focus to Done.
    if (revealed) doneRef.current?.focus()
  }, [revealed])

  function reset() {
    session.current += 1
    setNickname("")
    setMerchantId("")
    setLimitText("")
    setCurrency("USD")
    setCategory(NO_CATEGORY)
    setErrors({})
    setFormError(null)
    setRevealed(null)
    setCopyState("idle")
  }

  /** Editing a field clears its own error and the summary of the last submit. */
  function clearError(field: string) {
    setFormError(null)
    setErrors((current) => {
      if (!(field in current)) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) reset()
  }

  function handleMerchantChange(id: string) {
    setMerchantId(id)
    clearError("merchantId")
    const picked = merchants.find((m) => m.id === id)
    // Default to the merchant's own currency. The server accepts any of the
    // three, so a different choice is warned about, not blocked.
    if (picked) setCurrency(picked.currency)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (inFlight.current) return

    // Convenience only: the server re-validates every field. When the text is
    // not an amount, send null anyway so the server reports every problem at
    // once; the card cannot be issued with a null limit.
    const limit = parseAmountToMinorUnits(limitText)
    const limitMessage = "Enter an amount such as 250 or 250.00."

    inFlight.current = true
    setPending(true)
    setErrors({})
    setFormError(null)
    const startedIn = session.current

    try {
      const response = await fetch("/api/cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nickname,
          merchantId,
          limit,
          currency,
          category: category === NO_CATEGORY ? null : category,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (session.current !== startedIn) {
        // Closed while the request was in flight: refresh the list, but do not
        // show a number to a form nobody is looking at.
        router.refresh()
        return
      }

      if (response.status === 201 && payload?.number && payload?.card) {
        setRevealed({ number: payload.number, card: payload.card })
        router.refresh()
      } else if (response.status === 400) {
        setErrors({
          ...(payload?.fields ?? {}),
          ...(limit === null ? { limit: limitMessage } : {}),
        })
        setFormError(
          payload?.error ?? "The card was not issued. Check the highlighted fields.",
        )
      } else {
        setFormError(
          payload?.error ?? "Something went wrong and the card was not issued.",
        )
      }
    } catch {
      if (session.current === startedIn) {
        setFormError("Could not reach the server. The card was not issued.")
      }
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  async function copyNumber() {
    if (!revealed) return
    try {
      await navigator.clipboard.writeText(revealed.number)
      setCopyState("copied")
    } catch {
      setCopyState("failed")
    }
  }

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerTrigger asChild>
        <Button className="w-full gap-2 py-1.5 sm:w-fit">
          <Plus className="-ml-0.5 size-4 shrink-0" aria-hidden="true" />
          Issue card
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        {revealed ? (
          <>
            <DrawerHeader>
              <DrawerTitle>Card issued</DrawerTitle>
              <DrawerDescription>
                Copy the number now. It is shown once and cannot be retrieved
                later.
              </DrawerDescription>
            </DrawerHeader>
            <DrawerBody className="space-y-6">
              <div>
                <p className={labelClass}>Card number</p>
                <p
                  className="mt-2 rounded-md bg-gray-50 px-3 py-3 font-mono text-xl tracking-wider text-gray-900 dark:bg-gray-900 dark:text-gray-50"
                  data-testid="revealed-number"
                >
                  {revealed.number.replace(/(\d{4})(?=\d)/g, "$1 ")}
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <Button type="button" variant="secondary" onClick={copyNumber}>
                    Copy number
                  </Button>
                  <p role="status" className="text-sm text-gray-500">
                    {copyState === "copied" && "Copied to your clipboard."}
                    {copyState === "failed" &&
                      "Could not copy. Select the number and copy it by hand."}
                  </p>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-gray-500">Nickname</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-50">
                    {revealed.card.nickname}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Spend limit</dt>
                  <dd className="font-medium tabular-nums text-gray-900 dark:text-gray-50">
                    {formatMoney(revealed.card.limit, revealed.card.currency)}
                  </dd>
                </div>
              </dl>
              <p className="text-sm text-gray-500">
                After you close this, the card shows as{" "}
                <span className="font-mono">{maskCardNumber(revealed.card.last4)}</span>
                .
              </p>
            </DrawerBody>
            <DrawerFooter className="mt-4 items-center justify-between gap-2">
              <Button variant="secondary" asChild>
                <Link
                  href={`/cards/${revealed.card.id}`}
                  onClick={() => handleOpenChange(false)}
                >
                  View card
                </Link>
              </Button>
              <Button ref={doneRef} onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </DrawerFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="flex flex-1 flex-col">
            <DrawerHeader>
              <DrawerTitle>Issue a virtual card</DrawerTitle>
              <DrawerDescription>
                Single-merchant and always virtual. The limit applies from the
                moment the card exists.
              </DrawerDescription>
            </DrawerHeader>
            <DrawerBody className="space-y-5">
              {formError && (
                <p
                  role="alert"
                  className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400"
                >
                  {formError}
                </p>
              )}

              <div>
                <label htmlFor="card-nickname" className={labelClass}>
                  Nickname
                </label>
                <Input
                  id="card-nickname"
                  className="mt-2"
                  value={nickname}
                  maxLength={MAX_NICKNAME_LENGTH}
                  onChange={(event) => {
                    setNickname(event.target.value)
                    clearError("nickname")
                  }}
                  placeholder="Ad spend, vendor tools…"
                  hasError={Boolean(errors.nickname)}
                  aria-invalid={Boolean(errors.nickname)}
                  aria-describedby={errors.nickname ? "card-nickname-error" : undefined}
                />
                {errors.nickname && (
                  <p id="card-nickname-error" className={errorClass}>
                    {errors.nickname}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="card-merchant" className={labelClass}>
                  Merchant
                </label>
                <Select value={merchantId} onValueChange={handleMerchantChange}>
                  <SelectTrigger
                    id="card-merchant"
                    className="mt-2"
                    aria-invalid={Boolean(errors.merchantId)}
                    aria-describedby={
                      errors.merchantId ? "card-merchant-error" : undefined
                    }
                  >
                    <SelectValue placeholder="Choose a merchant" />
                  </SelectTrigger>
                  <SelectContent>
                    {merchants.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.merchantId && (
                  <p id="card-merchant-error" className={errorClass}>
                    {errors.merchantId}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="card-currency" className={labelClass}>
                  Currency
                </label>
                <Select
                  value={currency}
                  onValueChange={(value) => {
                    setCurrency(value as Currency)
                    clearError("currency")
                  }}
                >
                  <SelectTrigger
                    id="card-currency"
                    className="mt-2"
                    aria-invalid={Boolean(errors.currency)}
                    aria-describedby={
                      errors.currency ? "card-currency-error" : "card-currency-hint"
                    }
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CARD_CURRENCIES.map((code) => (
                      <SelectItem key={code} value={code}>
                        {code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.currency ? (
                  <p id="card-currency-error" className={errorClass}>
                    {errors.currency}
                  </p>
                ) : (
                  <p
                    id="card-currency-hint"
                    role={currencyMismatch ? "status" : undefined}
                    className={
                      currencyMismatch
                        ? "mt-1 text-xs text-amber-700 dark:text-amber-500"
                        : hintClass
                    }
                  >
                    {currencyMismatch
                      ? `${merchant.name} settles in ${merchant.currency}. This card will be issued in ${currency}.`
                      : "Defaults to the merchant's own currency."}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="card-limit" className={labelClass}>
                  Spend limit ({currency})
                </label>
                <Input
                  id="card-limit"
                  className="mt-2"
                  inputMode="decimal"
                  autoComplete="off"
                  value={limitText}
                  onChange={(event) => {
                    setLimitText(event.target.value)
                    clearError("limit")
                  }}
                  placeholder="250.00"
                  hasError={Boolean(errors.limit)}
                  aria-invalid={Boolean(errors.limit)}
                  aria-describedby={
                    errors.limit ? "card-limit-error" : "card-limit-hint"
                  }
                />
                {errors.limit ? (
                  <p id="card-limit-error" className={errorClass}>
                    {errors.limit}
                  </p>
                ) : (
                  <p id="card-limit-hint" className={hintClass}>
                    Maximum {formatMoney(MAX_LIMIT, currency)}.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="card-category" className={labelClass}>
                  Merchant category (optional)
                </label>
                <Select
                  value={category}
                  onValueChange={(value) => {
                    setCategory(value)
                    clearError("category")
                  }}
                >
                  <SelectTrigger
                    id="card-category"
                    className="mt-2"
                    aria-invalid={Boolean(errors.category)}
                    aria-describedby={
                      errors.category ? "card-category-error" : "card-category-hint"
                    }
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CATEGORY}>No category lock</SelectItem>
                    {CARD_CATEGORIES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {CATEGORY_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.category ? (
                  <p id="card-category-error" className={errorClass}>
                    {errors.category}
                  </p>
                ) : (
                  <p id="card-category-hint" className={hintClass}>
                    Locks the card to one kind of spend and shows it on the card.
                  </p>
                )}
              </div>
            </DrawerBody>
            <DrawerFooter className="mt-4 items-center justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending} isLoading={pending}>
                {pending ? "Issuing…" : "Issue card"}
              </Button>
            </DrawerFooter>
          </form>
        )}
      </DrawerContent>
    </Drawer>
  )
}
