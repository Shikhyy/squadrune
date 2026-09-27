import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Squadrune — The Parallel Multi-Agent Code Verification Layer',
  description:
    'Sovereign multi-agent code verification: Security, Architecture, Spec Compliance, and Tests in parallel under 2 seconds. Install via NPM, NPX, or Homebrew.',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: '/icon.svg',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#07131D] text-zinc-100 font-sans antialiased selection:bg-[#4CA5C7]/25 selection:text-[#A8D7E8]">
        {children}
      </body>
    </html>
  )
}
