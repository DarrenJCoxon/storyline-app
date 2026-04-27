import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Welcome from './screens/Welcome';
import Progress from './screens/Progress';
import Done from './screens/Done';

type Screen = 'welcome' | 'progress' | 'done' | 'error';

interface InstallStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'done' | 'skipped';
}

const STEPS: InstallStep[] = [
  { id: 'detect',      label: 'Checking system',                 status: 'pending' },
  { id: 'install_ext', label: 'Installing Storyline extension',  status: 'pending' },
  { id: 'launch',      label: 'Ready to launch',                 status: 'pending' },
];

const STEP_DURATION_MS = 700;

export default function App() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [vsCodeDetected, setVsCodeDetected] = useState<boolean | null>(null);
  const [steps, setSteps] = useState<InstallStep[]>(STEPS);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<boolean>('check_vscode')
      .then(setVsCodeDetected)
      .catch(() => setVsCodeDetected(false));
  }, []);

  const startInstall = () => {
    setScreen('progress');
    setSteps(STEPS.map(s => ({ ...s })));
    setPercent(0);

    STEPS.forEach((_, idx) => {
      setTimeout(() => {
        setSteps(prev => prev.map((s, i) => ({
          ...s,
          status: i < idx ? 'done' : i === idx ? 'active' : 'pending',
        })));
        setPercent(Math.round(((idx + 1) / STEPS.length) * 100));
      }, idx * STEP_DURATION_MS);
    });

    setTimeout(() => {
      setSteps(prev => prev.map(s => ({ ...s, status: 'done' })));
      setPercent(100);
      setScreen('done');
    }, STEPS.length * STEP_DURATION_MS);
  };

  if (screen === 'welcome') {
    return <Welcome vsCodeDetected={vsCodeDetected} onInstall={startInstall} />;
  }

  if (screen === 'progress') {
    return <Progress steps={steps} message="Setting things up…" percent={percent} />;
  }

  if (screen === 'done') {
    return <Done />;
  }

  return (
    <div className="error-screen">
      <p className="error-title">Something went wrong</p>
      <p className="error-message">{error}</p>
      <button className="btn-primary" onClick={() => { setScreen('welcome'); setError(null); }}>
        Go back
      </button>
    </div>
  );
}
