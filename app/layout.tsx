import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'SEC Tribunal',
  description:
    'Three AI agents put a public company on trial using real SEC EDGAR filings: prosecution, defense, cross-examination, verdict.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
