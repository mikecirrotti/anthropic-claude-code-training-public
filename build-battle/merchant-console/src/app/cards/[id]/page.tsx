import { Divider } from "@/components/Divider"
import { StatusBadge } from "@/components/ui/payments/StatusBadge"
import { merchantById } from "@/data/merchants"
import { cardById } from "@/data/queries"
import { CardEvent } from "@/data/types"
import {
  AMBER_PERCENT,
  CATEGORY_LABELS,
  isNearLimit,
  maskCardNumber,
  spendPercent,
} from "@/lib/card-meta"
import { formatInZone } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CardActions } from "../card-actions"

export const dynamic = "force-dynamic"

function describeEvent(event: CardEvent): string {
  if (event.from === null) return "Card issued"
  if (event.to === "frozen") return "Frozen"
  if (event.to === "cancelled") return "Cancelled"
  return "Unfrozen"
}

export default async function CardDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const card = cardById(id)
  if (!card) notFound()

  const merchant = merchantById(card.merchantId)
  const timeZone = merchant?.timezone ?? "UTC"
  const percent = spendPercent(card.spent, card.limit)
  const near = isNearLimit(card.spent, card.limit)
  const remaining = Math.max(0, card.limit - card.spent)

  return (
    <div className="p-4 sm:p-6">
      <Link
        href="/cards"
        className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-gray-50"
      >
        ← All cards
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">
          {card.nickname}
        </h1>
        <StatusBadge status={card.status} />
      </div>
      <p className="mt-1 font-mono text-sm text-gray-500">
        {maskCardNumber(card.last4)}
      </p>

      <div className="mt-4">
        <CardActions
          id={card.id}
          nickname={card.nickname}
          status={card.status}
          allowCancel
        />
      </div>

      <Divider />

      <h2 className="text-sm font-medium text-gray-900 dark:text-gray-50">
        Spend against limit
      </h2>
      <div
        role="progressbar"
        aria-label={`Spend against the limit for ${card.nickname}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${formatMoney(card.spent, card.currency)} of ${formatMoney(card.limit, card.currency)}, ${percent} percent${near ? ", over 80 percent of the limit" : ""}`}
        className="mt-3"
      >
        {/* An SVG bar, so the width is an attribute and no inline style is needed. */}
        <svg
          viewBox="0 0 100 3"
          preserveAspectRatio="none"
          className="h-2 w-full rounded-full"
          aria-hidden="true"
        >
          <rect width="100" height="3" className="fill-gray-200 dark:fill-gray-800" />
          <rect
            width={percent}
            height="3"
            className={near ? "fill-amber-500" : "fill-blue-500"}
          />
        </svg>
      </div>
      <p className="mt-2 text-sm tabular-nums text-gray-500">
        {formatMoney(card.spent, card.currency)} of{" "}
        {formatMoney(card.limit, card.currency)} ({percent}%)
        {near && (
          <span className="ml-2 font-medium text-amber-700 dark:text-amber-500">
            Over {AMBER_PERCENT}% of the limit
          </span>
        )}
      </p>

      <Divider />

      <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="text-sm text-gray-500">Merchant</dt>
          <dd className="text-gray-900 dark:text-gray-50">
            {merchant?.name ?? card.merchantId}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-gray-500">Spend limit</dt>
          <dd className="tabular-nums text-gray-900 dark:text-gray-50">
            {formatMoney(card.limit, card.currency)}{" "}
            <span className="text-gray-500">{card.currency}</span>
          </dd>
        </div>
        <div>
          <dt className="text-sm text-gray-500">Remaining</dt>
          <dd className="tabular-nums text-gray-900 dark:text-gray-50">
            {formatMoney(remaining, card.currency)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-gray-500">Category lock</dt>
          <dd className="text-gray-900 dark:text-gray-50">
            {card.category ? CATEGORY_LABELS[card.category] : "None"}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-gray-500">Created</dt>
          <dd className="text-gray-900 dark:text-gray-50">
            {formatInZone(card.createdAt, timeZone)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-gray-500">Reference</dt>
          <dd className="font-mono text-sm text-gray-900 dark:text-gray-50">
            {card.reference}
          </dd>
        </div>
      </dl>

      <Divider />

      <h2 className="text-sm font-medium text-gray-900 dark:text-gray-50">
        History
      </h2>
      <ol className="mt-3 space-y-2">
        {card.events.map((event) => (
          <li
            key={`${event.at}-${event.to}`}
            className="flex justify-between gap-4 text-sm"
          >
            <span className="text-gray-900 dark:text-gray-50">
              {describeEvent(event)}
            </span>
            <time dateTime={event.at} className="text-gray-500">
              {formatInZone(event.at, timeZone)}
            </time>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-gray-500">Times shown in {timeZone}.</p>
    </div>
  )
}
