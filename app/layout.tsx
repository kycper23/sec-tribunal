import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Cormorant_Garamond, IBM_Plex_Mono, Spectral } from 'next/font/google'
import './globals.css'

const spectral = Spectral({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
})
const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-display',
  display: 'swap',
})
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-mono',
  display: 'swap',
})

const DESCRIPTION =
  'Three AI agents try a US company on its own SEC filings. Code checks their work. Blind Trial grades the verdict against reality.'

export const metadata: Metadata = {
  metadataBase: new URL('https://sec-tribunal.vercel.app'),
  title: 'SEC Tribunal',
  description: DESCRIPTION,
  openGraph: {
    title: 'SEC Tribunal',
    description: DESCRIPTION,
    type: 'website',
    url: '/',
    images: [{ url: '/og-image.jpg', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SEC Tribunal',
    description: DESCRIPTION,
    images: ['/og-image.jpg'],
  },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${spectral.variable} ${cormorant.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}