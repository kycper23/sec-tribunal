/**
 * The tribunal cast as engraved hooded sages — pure stroke SVG, no images, no
 * faces; each figure reads by silhouette. The prop (arm, cloak, scales, quill)
 * sits in a `.avatar-prop` group and is the only thing that animates while the
 * agent works — see globals.css.
 */
export type AgentRole = 'prosecutor' | 'defense' | 'judge' | 'clerk'

export const ROLE_COLOR: Record<AgentRole, string> = {
  prosecutor: '#a13c2c', // cinnabar — the Skeptic
  defense: '#3e6b4f', // sage — the Advocate
  judge: '#433d63', // indigo — the Arbiter
  clerk: '#6b5b45', // sepia — the Scribe
}

/** Shared hooded head — the face is an ink void; sages are known by silhouette. */
const Hood = () => (
  <>
    <path d="M24 5.5 C19 5.5 16 9.8 16 14.5 C16 18 17.6 20.6 20 22 L28 22 C30.4 20.6 32 18 32 14.5 C32 9.8 29 5.5 24 5.5 Z" />
    <path
      d="M24 9.5 C21.3 9.5 19.8 12.2 19.8 15 C19.8 17.4 21.6 19.3 24 19.3 C26.4 19.3 28.2 17.4 28.2 15 C28.2 12.2 26.7 9.5 24 9.5 Z"
      fill="currentColor"
      stroke="none"
    />
  </>
)

/** Engraving hatch lines down the robe. */
const Hatch = ({ d }: { d: string }) => <path d={d} strokeWidth="1" opacity="0.45" />

const FIGURES: Record<AgentRole, React.ReactNode> = {
  // The Skeptic — hooded figure, accusing arm raised. The arm is the prop.
  prosecutor: (
    <>
      <Hood />
      <path d="M15.5 42 C15.5 31 18.5 24.6 24 24.2 C29.5 24.6 32.5 31 32.5 42" />
      <Hatch d="M20.5 30 L19.6 41 M24 28.5 V41" />
      <g className="avatar-prop">
        <path d="M27 31 L33.5 24.5" strokeWidth="1.4" opacity="0.6" />
        <path d="M28.5 27.5 L37.5 18.5" />
        <path d="M37.5 18.5 L41 15.5" />
      </g>
    </>
  ),
  // The Advocate — broad sheltering cloak. The cloak is the prop.
  defense: (
    <>
      <Hood />
      <g className="avatar-prop">
        <path d="M11.5 42 C13 30.5 17.5 24.6 24 24.2 C30.5 24.6 35 30.5 36.5 42" />
        <Hatch d="M16.5 31.5 L15.2 41.5 M31.5 31.5 L32.8 41.5 M24 28.5 V41" />
      </g>
    </>
  ),
  // The Arbiter — hooded figure holding balance scales. The scales are the prop.
  judge: (
    <>
      <Hood />
      <path d="M17 42 C17 31 19.7 24.6 24 24.2 C28.3 24.6 31 31 31 42" />
      <Hatch d="M21 30 L20.4 41 M27 30 L27.6 41" />
      <path d="M24 25.5 V29" strokeWidth="1.4" />
      <g className="avatar-prop">
        <path d="M16.5 29 H31.5" />
        <path d="M16.5 29 V33.2 M31.5 29 V33.2" strokeWidth="1.2" />
        <path d="M13 33.2 A3.5 3.5 0 0 0 20 33.2" />
        <path d="M28 33.2 A3.5 3.5 0 0 0 35 33.2" />
      </g>
    </>
  ),
  // The Scribe — hooded figure over a sheet, quill working. The quill is the prop.
  clerk: (
    <>
      <Hood />
      <path d="M15.5 42 C15.5 31 18.5 24.6 24 24.2 C29.5 24.6 32.5 31 32.5 42" />
      <Hatch d="M20.5 30 L19.6 41" />
      <path d="M27 35.5 L39 34 L40 41.5 L28.5 43 Z" strokeWidth="1.4" fill="currentColor" fillOpacity="0.08" />
      <g className="avatar-prop">
        <path d="M30.5 37.5 L36.5 28.5" />
        <path d="M34.4 31.6 L37.2 30.2 M35.4 30 L38 28.6" strokeWidth="1.2" />
      </g>
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
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: ROLE_COLOR[role] }}
      aria-hidden="true"
    >
      {FIGURES[role]}
    </svg>
  )
}