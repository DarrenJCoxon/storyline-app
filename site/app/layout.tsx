import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Inter, Lora } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-ui',
  display: 'swap',
})
const lora = Lora({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Storyline — Plan and write your novel',
  description:
    'A planning and writing environment for novelists. Save the Cat structure, distraction-free editor, EPUB & PDF compile.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${lora.variable}`}>
      <body>{children}</body>
    </html>
  )
}
