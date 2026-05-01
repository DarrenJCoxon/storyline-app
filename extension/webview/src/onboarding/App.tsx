import React, { useEffect, useReducer, useCallback } from 'react'
import { Welcome } from './screens/Welcome.js'
import { BuyCredits } from './screens/BuyCredits.js'
import { BYOKSetup } from './screens/BYOKSetup.js'
import { NewProject } from './screens/NewProject.js'
import { useVSCode } from '../planning/hooks/useVSCode.js'
import '../planning/tokens.css'

type Screen = 'welcome' | 'buy-credits' | 'byok' | 'new-project'

interface ValidateResult {
  success: boolean
  creditBalance?: number
  error?: string
}

interface TestResult {
  success: boolean
  error?: string
}

interface ReturningUser {
  creditBalance?: number
  licenceType?: string
  providerName?: string
}

interface AppState {
  screen: Screen
  workspaceName: string
  validateResult: ValidateResult | null
  testResult: TestResult | null
  scaffolded: boolean
  error: string | null
  returningUser: ReturningUser | null
}

type Action =
  | { type: 'INIT'; workspaceName: string; initialScreen: Screen; returningUser?: ReturningUser | null }
  | { type: 'NAVIGATE'; to: Screen }
  | { type: 'VALIDATE_RESULT'; success: boolean; creditBalance?: number; error?: string }
  | { type: 'TEST_RESULT'; success: boolean; error?: string }
  | { type: 'SCAFFOLDED' }
  | { type: 'ERROR'; message: string }

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'INIT':
      return { ...state, workspaceName: action.workspaceName, screen: action.initialScreen, returningUser: action.returningUser ?? null }
    case 'NAVIGATE':
      return { ...state, screen: action.to, validateResult: null, testResult: null }
    case 'VALIDATE_RESULT':
      return { ...state, validateResult: { success: action.success, creditBalance: action.creditBalance, error: action.error } }
    case 'TEST_RESULT':
      return { ...state, testResult: { success: action.success, error: action.error } }
    case 'SCAFFOLDED':
      return { ...state, scaffolded: true }
    case 'ERROR':
      return { ...state, error: action.message }
    default:
      return state
  }
}

const INITIAL: AppState = {
  screen: 'welcome',
  workspaceName: 'My Novel',
  validateResult: null,
  testResult: null,
  scaffolded: false,
  error: null,
  returningUser: null,
}

export function App() {
  const [state, dispatch] = useReducer(reducer, INITIAL)
  const { on, send } = useVSCode()

  useEffect(() => {
    const offs = [
      on<{
        workspaceName: string
        initialScreen: Screen
        returningUser?: boolean
        creditBalance?: number
        licenceType?: string
        providerName?: string
      }>('init', m =>
        dispatch({
          type: 'INIT',
          workspaceName: m.workspaceName,
          initialScreen: m.initialScreen ?? 'welcome',
          returningUser: m.returningUser
            ? { creditBalance: m.creditBalance, licenceType: m.licenceType, providerName: m.providerName }
            : null,
        }),
      ),
      on<{ to: Screen }>('navigate', m => dispatch({ type: 'NAVIGATE', to: m.to })),
      on<{ success: boolean; creditBalance?: number; error?: string }>('validateResult', m =>
        dispatch({ type: 'VALIDATE_RESULT', ...m }),
      ),
      on<{ success: boolean; error?: string }>('testResult', m =>
        dispatch({ type: 'TEST_RESULT', ...m }),
      ),
      on('scaffolded', () => dispatch({ type: 'SCAFFOLDED' })),
      on<{ message: string }>('error', m => dispatch({ type: 'ERROR', message: m.message })),
    ]
    return () => offs.forEach(off => off())
  }, [on])

  const navigate = useCallback((to: Screen) => dispatch({ type: 'NAVIGATE', to }), [])

  // Once a licence key has been validated successfully — wherever it was
  // entered (Welcome's "I already have a key" or the BuyCredits flow's
  // post-purchase activation) — skip straight to the project setup screen.
  useEffect(() => {
    if (state.validateResult?.success && state.screen !== 'new-project') {
      navigate('new-project')
    }
  }, [state.validateResult, state.screen, navigate])

  const { screen, workspaceName, validateResult, testResult, scaffolded, returningUser } = state

  return (
    <div style={{
      height: '100vh',
      background: 'var(--chat-bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px',
    }}>
      {screen === 'welcome' && (
        <Welcome
          onNavigate={navigate}
          onUseFree={() => { send({ type: 'useFree' }) }}
          onActivateKey={key => send({ type: 'validateLicence', key })}
          validating={false}
          validateError={validateResult && !validateResult.success ? validateResult.error ?? 'Activation failed.' : null}
        />
      )}
      {screen === 'buy-credits' && (
        <BuyCredits
          onBack={() => navigate('welcome')}
          onNavigate={navigate}
          validateResult={validateResult}
          onOpenStripe={pack => send({ type: 'openStripe', pack })}
          onValidate={key => send({ type: 'validateLicence', key })}
        />
      )}
      {screen === 'byok' && (
        <BYOKSetup
          onBack={() => navigate('welcome')}
          onNavigate={navigate}
          testResult={testResult}
          onTest={config => send({ type: 'testByok', config })}
          onSave={config => { send({ type: 'saveByok', config }); navigate('new-project') }}
        />
      )}
      {screen === 'new-project' && (
        <NewProject
          workspaceName={workspaceName}
          scaffolded={scaffolded}
          returningUser={returningUser}
          onScaffold={name => send({ type: 'scaffold', name })}
        />
      )}
    </div>
  )
}
