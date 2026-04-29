import React, { useEffect, useReducer, useRef, useCallback, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
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

export interface StoryTrapFinding {
  id: string
  name: string
  severity: 'error' | 'warning' | 'suggestion'
  description: string
  details?: string
  fixProtocol?: string[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  streaming?: boolean
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number; costUsd: number | null }
  stageCompleteCard?: { stageId: string; stageName: string; statePath: string; memoryMethod?: 'odd-flow' | 'jsonl' | 'skipped' }
  findingsCard?: { findings: StoryTrapFinding[] }
  seriesDetectedCard?: { suggestion: string; indicators: string[] }
  downstreamImpactsCard?: { stageId: string; impacts: string[] }
  critiqueCard?: { findings: string; tier: string; stageId: string }
  planningCompleteCard?: PlanningCompleteArtefacts
}

export interface PlanningCompleteArtefacts {
  mode: 'fiction' | 'nonfiction'
  masterDocPath: string | null
  chapterCardPaths: string[]
  manuscriptPaths: string[]
  firstChapterPath: string | null
  storyBiblePath: string | null
  arcMatrixPath: string | null
  promiseLedgerPath: string | null
  researchTodoPath: string | null
  claimLedgerPath: string | null
  figureRegistryPath: string | null
}

export interface CreditInfo {
  balance: number
  type: 'free' | 'credits' | 'byok'
  providerName?: string
}

export interface SessionMeta {
  id: string
  timestamp: number
  preview: string
}

interface AppState {
  stages: StageInfo[]
  messages: ChatMessage[]
  streamingId: string | null
  creditInfo: CreditInfo
  railCollapsed: boolean
  creditsExhausted: boolean
  error: string | null
  restoredAt: number
}

type Action =
  | { type: 'INIT'; stages: StageInfo[]; creditBalance: number; licenceType: CreditInfo['type']; providerName?: string }
  | { type: 'RESTORE_MESSAGES'; turns: Array<{ role: 'user' | 'assistant'; content: string }> }
  | { type: 'CLEAR_MESSAGES' }
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
  | { type: 'FINDINGS_CARD'; findings: StoryTrapFinding[] }
  | { type: 'SERIES_DETECTED'; suggestion: string; indicators: string[] }
  | { type: 'DOWNSTREAM_IMPACTS'; stageId: string; impacts: string[] }
  | { type: 'CRITIQUE_CARD'; findings: string; tier: string; stageId: string }
  | { type: 'PLANNING_COMPLETE'; artefacts: PlanningCompleteArtefacts }
  | { type: 'MEMORY_STORED'; stageId: string; method: 'odd-flow' | 'jsonl' | 'skipped'; error?: string }
  | { type: 'SAVE_GATED'; stageId: string; missing: string[] }
  | { type: 'CREDIT_UPDATE'; balance: number }
  | { type: 'REQUEST_USAGE'; promptTokens: number; completionTokens: number; totalTokens: number; costUsd: number | null }

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
        restoredAt: state.restoredAt + 1,
      }

    case 'CLEAR_MESSAGES':
      return {
        ...state,
        messages: [],
        streamingId: null,
        restoredAt: state.restoredAt + 1,
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

    case 'STAGE_COMPLETE': {
      const card: ChatMessage = {
        id: uid(),
        role: 'system',
        content: '',
        stageCompleteCard: { stageId: action.stageId, stageName: action.stageName, statePath: action.statePath },
      }
      // Insert the card before the last assistant message so it appears
      // above the "Now — Stage N" transition text rather than below it.
      const msgs = [...state.messages]
      let idx = msgs.length - 1
      while (idx > 0 && msgs[idx].role !== 'assistant') idx--
      if (msgs[idx]?.role === 'assistant') {
        msgs.splice(idx, 0, card)
      } else {
        msgs.push(card)
      }
      return { ...state, messages: msgs }
    }

    case 'STAGE_ADVANCE':
      return { ...state, stages: action.stages }

    case 'TOGGLE_RAIL':
      return { ...state, railCollapsed: !state.railCollapsed }

    case 'CREDITS_EXHAUSTED':
      return { ...state, creditsExhausted: true, streamingId: null }

    case 'ERROR':
      return { ...state, error: action.message }

    case 'FINDINGS_CARD':
      return {
        ...state,
        messages: [...state.messages, { id: uid(), role: 'system', content: '', findingsCard: { findings: action.findings } }],
      }

    case 'SERIES_DETECTED':
      return {
        ...state,
        messages: [...state.messages, { id: uid(), role: 'system', content: '', seriesDetectedCard: { suggestion: action.suggestion, indicators: action.indicators } }],
      }

    case 'DOWNSTREAM_IMPACTS':
      return {
        ...state,
        messages: [...state.messages, { id: uid(), role: 'system', content: '', downstreamImpactsCard: { stageId: action.stageId, impacts: action.impacts } }],
      }

    case 'CRITIQUE_CARD':
      return {
        ...state,
        messages: [...state.messages, { id: uid(), role: 'system', content: '', critiqueCard: { findings: action.findings, tier: action.tier, stageId: action.stageId } }],
      }

    case 'PLANNING_COMPLETE':
      return {
        ...state,
        messages: [...state.messages, { id: uid(), role: 'system', content: '', planningCompleteCard: action.artefacts }],
      }

    case 'CREDIT_UPDATE':
      return { ...state, creditInfo: { ...state.creditInfo, balance: action.balance } }

    case 'REQUEST_USAGE': {
      // Attach usage to the most recent assistant message
      const msgs = [...state.messages]
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          msgs[i] = { ...msgs[i], usage: { promptTokens: action.promptTokens, completionTokens: action.completionTokens, totalTokens: action.totalTokens, costUsd: action.costUsd } }
          break
        }
      }
      return { ...state, messages: msgs }
    }

    case 'SAVE_GATED': {
      console.warn('[Storyline] save gated', action.stageId, action.missing)
      return state
    }

    case 'MEMORY_STORED': {
      // Annotate the most-recent stage-complete card for this stageId
      // with the memory method, instead of adding another card.
      const updated = [...state.messages]
      for (let i = updated.length - 1; i >= 0; i--) {
        const m = updated[i]
        if (m.stageCompleteCard?.stageId === action.stageId) {
          updated[i] = { ...m, stageCompleteCard: { ...m.stageCompleteCard, memoryMethod: action.method } }
          break
        }
      }
      return { ...state, messages: updated }
    }

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
  restoredAt: 0,
}

function formatSessionDate(timestamp: number): string {
  const d = new Date(timestamp)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = d.toDateString() === yesterday.toDateString()
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  const time = `${hh}:${mm}`
  if (isToday) return `Today ${time}`
  if (isYesterday) return `Yesterday ${time}`
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${time}`
}

interface HistoryPanelProps {
  sessions: SessionMeta[]
  onLoad: (id: string) => void
  onClose: () => void
}

function HistoryPanel({ sessions, onLoad, onClose }: HistoryPanelProps) {
  return (
    <div style={{
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      width: '280px',
      background: 'var(--chat-bg)',
      borderLeft: '1px solid var(--sep)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 20,
      boxShadow: '-4px 0 12px rgba(0,0,0,0.08)',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        borderBottom: '1px solid var(--sep)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>History</span>
        <button
          onClick={onClose}
          title="Close history"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            borderRadius: '4px',
            lineHeight: 0,
          }}
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
        {sessions.length === 0 ? (
          <div style={{ padding: '20px 12px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
            No previous sessions
          </div>
        ) : (
          sessions.map(s => (
            <button
              key={s.id}
              onClick={() => onLoad(s.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 10px',
                cursor: 'pointer',
                marginBottom: '2px',
                transition: 'background 120ms',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-sub)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
            >
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px', fontVariantNumeric: 'tabular-nums' }}>
                {formatSessionDate(s.timestamp)}
              </div>
              <div style={{
                fontSize: '12px',
                color: 'var(--text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {s.preview}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

export function App() {
  const [state, dispatch] = useReducer(reducer, INITIAL)
  const { on, send } = useVSCode()
  const { mode, setMode } = useTheme(send)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [sessions, setSessions] = useState<SessionMeta[]>([])

  // Tell the extension host we're ready to receive messages.
  useEffect(() => {
    send({ type: 'ready' })
  }, [send])

  // Wire incoming messages from extension host
  useEffect(() => {
    const offs = [
      on<{ stages: StageInfo[]; creditBalance: number; licenceType: CreditInfo['type']; providerName?: string }>('init', m =>
        dispatch({ type: 'INIT', stages: m.stages, creditBalance: m.creditBalance, licenceType: m.licenceType ?? 'free', providerName: m.providerName }),
      ),
      on<{ turns: Array<{ role: 'user' | 'assistant'; content: string }> }>('restoreMessages', m => {
        dispatch({ type: 'RESTORE_MESSAGES', turns: m.turns })
        setHistoryOpen(false)
      }),
      on('clearMessages', () => dispatch({ type: 'CLEAR_MESSAGES' })),
      on<{ sessions: SessionMeta[] }>('sessionsLoaded', m => {
        setSessions(m.sessions)
        setHistoryOpen(true)
      }),
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
      on<{ findings: StoryTrapFinding[] }>('findingsCard', m => dispatch({ type: 'FINDINGS_CARD', findings: m.findings })),
      on<{ suggestion: string; indicators: string[] }>('seriesDetected', m => dispatch({ type: 'SERIES_DETECTED', suggestion: m.suggestion, indicators: m.indicators })),
      on<{ stageId: string; impacts: string[] }>('downstreamImpacts', m => dispatch({ type: 'DOWNSTREAM_IMPACTS', stageId: m.stageId, impacts: m.impacts })),
      on<{ findings: string; tier: string; stageId: string }>('critiqueCard', m => dispatch({ type: 'CRITIQUE_CARD', findings: m.findings, tier: m.tier, stageId: m.stageId })),
      on<{ artefacts: PlanningCompleteArtefacts }>('planningComplete', m => dispatch({ type: 'PLANNING_COMPLETE', artefacts: m.artefacts })),
      on<{ stageId: string; method: 'odd-flow' | 'jsonl' | 'skipped'; error?: string }>('memoryStored', m => dispatch({ type: 'MEMORY_STORED', stageId: m.stageId, method: m.method, error: m.error })),
      on<{ stageId: string; missing: string[] }>('saveGated', m => dispatch({ type: 'SAVE_GATED', stageId: m.stageId, missing: m.missing })),
      on<{ balance: number }>('creditUpdate', m => dispatch({ type: 'CREDIT_UPDATE', balance: m.balance })),
      on<{ promptTokens: number; completionTokens: number; totalTokens: number; costUsd: number | null }>('requestUsage', m =>
        dispatch({ type: 'REQUEST_USAGE', promptTokens: m.promptTokens, completionTokens: m.completionTokens, totalTokens: m.totalTokens, costUsd: m.costUsd }),
      ),
    ]
    return () => offs.forEach(off => off())
  }, [on])

  const handleSend = useCallback((text: string) => {
    send({ type: 'send', text })
  }, [send])

  const handleSave = useCallback(() => {
    send({ type: 'save' })
  }, [send])

  const handleStop = useCallback(() => {
    send({ type: 'stop' })
  }, [send])

  const handleOpenProjectFile = useCallback((path: string) => {
    send({ type: 'openProjectFile', path })
  }, [send])

  const handleToggleRail = useCallback(() => {
    dispatch({ type: 'TOGGLE_RAIL' })
    send({ type: 'setRailCollapsed', collapsed: !state.railCollapsed })
  }, [send, state.railCollapsed])

  const handleNewChat = useCallback(() => {
    send({ type: 'newChat' })
  }, [send])

  const handleShowHistory = useCallback(() => {
    send({ type: 'listSessions' })
  }, [send])

  const handleLoadSession = useCallback((id: string) => {
    send({ type: 'loadSession', id })
  }, [send])

  const activeStage = state.stages.find(s => s.active)
  const activeStageIndex = state.stages.findIndex(s => s.active)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--chat-bg)', position: 'relative' }}>
      <Header
        creditInfo={state.creditInfo}
        activeStageIndex={activeStageIndex}
        stageCount={state.stages.length}
        themeMode={mode}
        onThemeChange={setMode}
        onNewChat={handleNewChat}
        onShowHistory={handleShowHistory}
        isStreaming={!!state.streamingId}
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
        onOpenProjectFile={handleOpenProjectFile}
        restoredAt={state.restoredAt}
      />

      {state.messages.length === 0 && !state.streamingId && state.stages.length > 0 && (
        <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Starting Storyline…</div>
          {state.error && (
            <div style={{ fontSize: '12px', color: 'var(--vscode-errorForeground, #f44)', textAlign: 'center', maxWidth: '400px' }}>
              {state.error}
            </div>
          )}
        </div>
      )}

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
        onStop={handleStop}
        isStreaming={!!state.streamingId}
        disabled={!!state.streamingId || state.creditsExhausted}
      />

      {historyOpen && (
        <HistoryPanel
          sessions={sessions}
          onLoad={handleLoadSession}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  )
}
