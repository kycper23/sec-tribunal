/**
 * Hand-drawn SVG avatars for the tribunal cast — no external images, crisp at
 * any size, and colour-matched to each role's palette.
 */
export type AgentRole = 'prosecutor' | 'defense' | 'judge' | 'clerk'

export const ROLE_COLOR: Record<AgentRole, string> = {
  prosecutor: '#a13c2c', // cinnabar — the Skeptic
  defense: '#3e6b4f', // sage — the Advocate
  judge: '#433d63', // indigo — the Arbiter
  clerk: '#6b5b45', // sepia — the Scribe
}

const ICONS: Record<AgentRole, React.ReactNode> = {
  // A sword — the prosecution on the attack.
  prosecutor: (
    <>
      <path d="M33 8 L39 14 L22 34 L14 26 Z" fill="currentColor" fillOpacity="0.16" />
      <path d="M33 8 L39 14 L22 34 L14 26 Z" />
      <path d="M12 30 L18 36" />
      <path d="M9 39 L14 34" />
    </>
  ),
  // A shield with a check — the defense holding the line.
  defense: (
    <>
      <path
        d="M24 7 L37 12.5 V22 C37 30.5 31.5 36.8 24 41 C16.5 36.8 11 30.5 11 22 V12.5 Z"
        fill="currentColor"
        fillOpacity="0.16"
      />
      <path d="M24 7 L37 12.5 V22 C37 30.5 31.5 36.8 24 41 C16.5 36.8 11 30.5 11 22 V12.5 Z" />
      <path d="M18 23.5 L22.5 28 L30.5 18.5" />
    </>
  ),
  // A gavel — the judge.
  judge: (
    <>
      <path d="M27 6 L38 17 L31.5 23.5 L20.5 12.5 Z" fill="currentColor" fillOpacity="0.16" />
      <path d="M27 6 L38 17 L31.5 23.5 L20.5 12.5 Z" />
      <path d="M24 19 L10 33" />
      <path d="M14 41 H34" />
    </>
  ),
  // A filed document — the clerk.
  clerk: (
    <>
      <path d="M15 6 H29 L34 11 V42 H15 Z" fill="currentColor" fillOpacity="0.12" />
      <path d="M15 6 H29 L34 11 V42 H15 Z" />
      <path d="M29 6 V11 H34" />
      <path d="M20 20 H29 M20 26 H29 M20 32 H26" />
    </>
  ),
}

export function AgentAvatar({ role, size = 48 }: { role: AgentRole; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: ROLE_COLOR[role] }}
      aria-hidden="true"
    >
      {ICONS[role]}
    </svg>
  )
}