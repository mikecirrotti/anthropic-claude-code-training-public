import Link from "next/link"

export default function CardNotFound() {
  return (
    <div className="p-4 py-16 text-center sm:p-6">
      <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
        Card not found
      </h1>
      <p className="mt-1 text-gray-500">
        There is no card with that ID. Cards live until the server restarts, so
        one issued earlier may be gone.
      </p>
      <Link
        href="/cards"
        className="mt-4 inline-block font-medium text-blue-600 hover:underline dark:text-blue-500"
      >
        Back to all cards
      </Link>
    </div>
  )
}
