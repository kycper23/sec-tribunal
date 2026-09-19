import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export const alt = 'SEC Tribunal'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          backgroundColor: '#1C1913',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            margin: 32,
            border: '2px solid #7C5F18',
          }}
        >
          <div
            style={{
              fontFamily: 'serif',
              fontSize: 90,
              color: '#EDE4D0',
              textAlign: 'center',
              letterSpacing: 4,
            }}
          >
            SEC TRIBUNAL
          </div>
          <div
            style={{
              marginTop: 24,
              fontSize: 32,
              color: '#C9BCA2',
              textAlign: 'center',
            }}
          >
            Three AI agents put a public company on trial
          </div>
          <div
            style={{
              position: 'absolute',
              bottom: 56,
              fontFamily: 'monospace',
              fontSize: 24,
              color: '#B8862B',
              textAlign: 'center',
            }}
          >
            SEC EDGAR evidence · Built for Orbio Build Week
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}
