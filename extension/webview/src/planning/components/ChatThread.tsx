import React, { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { ChatMessage } from '../App.js'
import { UserBubble } from './MessageBubble.js'
import { AIMessage } from './AIMessage.js'
import { StageCompleteCard, FindingsCard, SeriesDetectedCard, DownstreamImpactsCard, CritiqueCard } from './Cards.js'

interface Props {
  messages: ChatMessage[]
  streamingId: string | null
}

export function ChatThread({ messages, streamingId }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // Scroll to bottom on chunk too, but without layout cost
  useEffect(() => {
    if (streamingId) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' })
    }
  })

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      padding: '20px 28px',
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
    }}>
      <AnimatePresence initial={false}>
        {messages.map(msg => {
          if (msg.stageCompleteCard) {
            return (
              <StageCompleteCard
                key={msg.id}
                stageName={msg.stageCompleteCard.stageName}
                statePath={msg.stageCompleteCard.statePath}
              />
            )
          }
          if (msg.findingsCard) {
            return <FindingsCard key={msg.id} findings={msg.findingsCard.findings} />
          }
          if (msg.seriesDetectedCard) {
            return <SeriesDetectedCard key={msg.id} suggestion={msg.seriesDetectedCard.suggestion} indicators={msg.seriesDetectedCard.indicators} />
          }
          if (msg.downstreamImpactsCard) {
            return <DownstreamImpactsCard key={msg.id} stageId={msg.downstreamImpactsCard.stageId} impacts={msg.downstreamImpactsCard.impacts} />
          }
          if (msg.critiqueCard) {
            return <CritiqueCard key={msg.id} findings={msg.critiqueCard.findings} tier={msg.critiqueCard.tier} stageId={msg.critiqueCard.stageId} />
          }
          if (msg.role === 'user') {
            return <UserBubble key={msg.id} text={msg.content} />
          }
          return (
            <AIMessage
              key={msg.id}
              content={msg.content}
              streaming={msg.id === streamingId}
            />
          )
        })}
      </AnimatePresence>
      <div ref={bottomRef} />
    </div>
  )
}
