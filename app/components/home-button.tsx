/**
 * Persistent way back to the courtroom (`/`) from any subpage — fixed in the
 * corner so it stays reachable no matter how far the user has scrolled.
 * The house icon follows the same engraved line-icon language as the
 * hourglass/arrows used elsewhere (see blind-trial-toggle.tsx, prophecy-panel.tsx):
 * no emoji, no icon font, just currentColor strokes.
 */
import Link from 'next/link'

function HouseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9.5h12V10" />
      <path d="M10 19.5V14h4v5.5" />
    </svg>
  )
}

export function HomeButton() {
  return (
    <Link href="/" className="home-btn" aria-label="Back to the courtroom">
      <HouseIcon />
      <span>Courtroom</span>
    </Link>
  )
}
