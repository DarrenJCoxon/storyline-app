import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Storyline — Plan and write your novel',
  description:
    'A planning and writing environment for novelists. Save the Cat structure, distraction-free editor, EPUB & PDF compile.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
