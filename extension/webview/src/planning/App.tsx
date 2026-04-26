import React, { useEffect, useReducer, useRef, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Header } from './components/Header.js'
import { StageRail } from './components/StageRail.js'
import { ChatThread } from './components/ChatThread.js'
import { InputBox } from './components/InputBox.js'
import { useVSCode } from './hooks/useVSCode.js'
import { useTheme } from './hooks/useTheme.js'
import './tokens.css'

export interface StageInfo {
  id: string
  name: string
  completed: boolean
  active: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  streaming?: boolean
  stageCompleteCard?: { stageId: string; stageName: string; statePath: string }
}

export interface CreditInfo {
  balance: number
  type: 'free' | 'credits' | 'byok'
  providerName?: string
}

interface AppState {
  stages: StageInfo[]
  messages: ChatMessage[]
  streamingId: string | null
  creditInfo: CreditInfo
  railCollapsed: boolean
  creditsExhausted: boolean
  error: string | null
}

type Action =
  | { type: 'INIT'; stages: StageInfo[]; creditBalance: number; licenceType: CreditInfo['type']; providerName?: string }
  | { type: 'RESTORE_MESSAGES'; turns: Array<{ role: 'user' | 'assistant'; content: string }> }
  | { type: 'USER_MSG'; text: string }
  | { type: 'STREAM_START' }
  | { type: 'STREAM_CHUNK'; text: string }
  | { type: 'STREAM_END' }
  | { type: 'STREAM_ERROR'; message: string }
  | { type: 'STAGE_COMPLETE'; stageId: string; stageName: string; statePath: string }
  | { type: 'STAGE_ADVANCE'; stages: StageInfo[] }
  | { type: 'TOGGLE_RAIL' }
  | { type: 'CREDITS_EXHAUSTED' }
  | { type: 'ERROR'; message: string }

function uid(): string {
  return Math.random().toString(36).slice(2)
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'INIT':
      return {
        ...state,
        stages: action.stages,
        creditInfo: { balance: action.creditBalance, type: action.licenceType, providerName: action.providerName },
        creditsExhausted: action.licenceType === 'credits' && action.creditBalance === 0,
        error: null,
      }

    case 'RESTORE_MESSAGES':
      return {
        ...state,
        messages: action.turns.map(t => ({ id: uid(), role: t.role, content: t.content })),
        streamingId: null,
      }

    case 'USER_MSG':
      return {
        ...state,
        messages: [...state.messages, { id: uid(), role: 'user', content: action.text }],
      }

    case 'STREAM_START': {
      const id = uid()
      return {
        ...state,
        streamingId: id,
        messages: [...state.messages, { id, role: 'assistant', content: '', streaming: true }],
      }
    }

    case 'STREAM_CHUNK': {
      if (!state.streamingId) return state
      return {
        ...state,
        messages: state.messages.map(m =>
          m.id === state.streamingId ? { ...m, content: m.content + action.text } : m,
        ),
      }
    }

    case 'STREAM_END':
      return {
        ...state,
        streamingId: null,
        messages: state.messages.map(m =>
          m.id === state.streamingId ? { ...m, streaming: false } : m,
        ),
      }

    case 'STREAM_ERROR':
      return {
        ...state,
        streamingId: null,
        messages: state.messages.map(m =>
          m.id === state.streamingId
            ? { ...m, content: `Error: ${action.message}`, streaming: false }
            : m,
        ),
      }

    case 'STAGE_COMPLETE':
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: uid(),
            role: 'system',
            content: '',
            stageCompleteCard: {
              stageId: action.stageId,
              stageName: action.stageName,
              statePath: action.statePath,
            },
          },
        ],
      }

    case 'STAGE_ADVANCE':
      return { ...state, stages: action.stages }

    case 'TOGGLE_RAIL':
      return { ...state, railCollapsed: !state.railCollapsed }

    case 'CREDITS_EXHAUSTED':
      return { ...state, creditsExhausted: true, streamingId: null }

    case 'ERROR':
      return { ...state, error: action.message }

    default:
      return state
  }
}

const INITIAL: AppState = {
  stages: [],
  messages: [],
  streamingId: null,
  creditInfo: { balance: 0, type: 'free' },
  railCollapsed: true,
  creditsExhausted: false,
  error: null,
}

export function App() {
  const [state, dispatch] = useReducer(reducer, INITIAL)
  const { on, send } = useVSCode()
  const { mode, setMode } = useTheme(send)

  // Wire incoming messages from extension host
  useEffect(() => {
    const offs = [
      on<{ stages: StageInfo[]; creditBalance: number; licenceType: CreditInfo['type']; providerName?: string }>('init', m =>
        dispatch({ type: 'INIT', stages: m.stages, creditBalance: m.creditBalance, licenceType: m.licenceType ?? 'free', providerName: m.providerName }),
      ),
      on<{ turns: Array<{ role: 'user' | 'assistant'; content: string }> }>('restoreMessages', m =>
        dispatch({ type: 'RESTORE_MESSAGES', turns: m.turns }),
      ),
      on<{ text: string }>('userMessage', m => dispatch({ type: 'USER_MSG', text: m.text })),
      on('streamStart', () => dispatch({ type: 'STREAM_START' })),
      on<{ text: string }>('streamChunk', m => dispatch({ type: 'STREAM_CHUNK', text: m.text })),
      on('streamEnd', () => dispatch({ type: 'STREAM_END' })),
      on<{ message: string }>('streamError', m => dispatch({ type: 'STREAM_ERROR', message: m.message })),
      on('creditsExhausted', () => dispatch({ type: 'CREDITS_EXHAUSTED' })),
      on<{ stageId: string; stageName: string; statePath: string }>('stageComplete', m =>
        dispatch({ type: 'STAGE_COMPLETE', ...m }),
      ),
      on<{ stages: StageInfo[] }>('stageAdvance', m => dispatch({ type: 'STAGE_ADVANCE', stages: m.stages })),
      on<{ message: string }>('error', m => dispatch({ type: 'ERROR', message: m.message })),
    ]
    return () => offs.forEach(off => off())
  }, [on])

  const handleSend = useCallback((text: string) => {
    send({ type: 'send', text })
  }, [send])

  const handleSave = useCallback(() => {
    send({ type: 'save' })
  }, [send])

  const handleToggleRail = useCallback(() => {
    dispatch({ type: 'TOGGLE_RAIL' })
    send({ type: 'setRailCollapsed', collapsed: !state.railCollapsed })
  }, [send, state.railCollapsed])

  const activeStage = state.stages.find(s => s.active)
  const activeStageIndex = state.stages.findIndex(s => s.active)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--chat-bg)' }}>
      <Header
        creditInfo={state.creditInfo}
        activeStageIndex={activeStageIndex}
        stageCount={state.stages.length}
        themeMode={mode}
        onThemeChange={setMode}
      />

      <StageRail
        stages={state.stages}
        collapsed={state.railCollapsed}
        onToggle={handleToggleRail}
        activeStage={activeStage ?? null}
      />

      <ChatThread
        messages={state.messages}
        streamingId={state.streamingId}
      />

      {state.creditsExhausted && (
        <div style={{
          padding: '8px 12px',
          background: 'var(--accent-sub)',
          borderTop: '1px solid rgba(201,168,76,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Your plan is complete — buy credits to continue with the writing mentor.
          </span>
          <button
            onClick={() => send({ type: 'topUpCredits' })}
            style={{
              background: 'var(--accent)',
              color: '#1A1A1A',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            Top up
          </button>
        </div>
      )}

      <InputBox
        onSend={handleSend}
        onSave={handleSave}
        disabled={!!state.streamingId || state.creditsExhausted}
      />
    </div>
  )
}
