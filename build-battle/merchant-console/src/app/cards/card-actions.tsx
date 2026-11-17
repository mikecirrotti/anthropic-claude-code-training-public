"use client"

import { Button } from "@/components/Button"
import { CardStatus } from "@/data/types"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"

/**
 * Freeze, unfreeze and (on the detail page) cancel. Each one is a PATCH to the
 * card route, which enforces the state machine; the UI only offers what the
 * server would allow. The page refreshes in place, with no full reload.
 */
export function CardActions({
  id,
  nickname,
  status,
  allowCancel = false,
}: {
  id: string
  nickname: string
  status: CardStatus
  allowCancel?: boolean
}) {
  const router = useRouter()
  const [refreshing, startTransition] = useTransition()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const inFlight = useRef(false)
  const keepRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // Default focus to the safe choice when the confirmation appears.
    if (confirmingCancel) keepRef.current?.focus()
  }, [confirmingCancel])

  // Cancelled is terminal, so there is nothing left to offer.
  if (status === "cancelled") return null

  async function change(to: CardStatus) {
    if (inFlight.current) return
    inFlight.current = true
    setPending(true)
    setError(null)
    try {
      const response = await fetch(`/api/cards/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: to }),
      })
      if (response.ok) {
        setConfirmingCancel(false)
      } else {
        const payload = await response.json().catch(() => null)
        setError(payload?.error ?? "The change was not saved.")
      }
      // On a refusal too: the card may have changed elsewhere, so show the
      // server's current state.
      startTransition(() => router.refresh())
    } catch {
      setError("Could not reach the server. The change was not saved.")
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  const busy = pending || refreshing
  const toggleTo: CardStatus = status === "active" ? "frozen" : "active"
  const toggleLabel = status === "active" ? "Freeze" : "Unfreeze"

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          className="py-1"
          disabled={busy}
          onClick={() => change(toggleTo)}
          aria-label={`${toggleLabel} ${nickname}`}
        >
          {toggleLabel}
        </Button>
        {allowCancel && !confirmingCancel && (
          <Button
            variant="secondary"
            className="py-1"
            disabled={busy}
            onClick={() => setConfirmingCancel(true)}
            aria-label={`Cancel ${nickname}`}
          >
            Cancel card
          </Button>
        )}
      </div>

      {allowCancel && confirmingCancel && (
        <div
          role="group"
          aria-label={`Confirm cancelling ${nickname}`}
          className="flex flex-col gap-2 rounded-md border border-red-200 p-3 dark:border-red-500/30"
        >
          <p className="text-sm text-gray-900 dark:text-gray-50">
            Cancel this card for good? A cancelled card cannot be reactivated.
          </p>
          <div className="flex gap-2">
            <Button
              ref={keepRef}
              variant="secondary"
              className="py-1"
              disabled={busy}
              onClick={() => setConfirmingCancel(false)}
            >
              Keep card
            </Button>
            <Button
              variant="destructive"
              className="py-1"
              disabled={busy}
              onClick={() => change("cancelled")}
            >
              Yes, cancel card
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-500">
          {error}
        </p>
      )}
    </div>
  )
}
