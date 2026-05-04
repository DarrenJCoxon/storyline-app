import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import Welcome from './screens/Welcome';
import Progress from './screens/Progress';
import Done from './screens/Done';

type Screen = 'welcome' | 'progress' | 'done' | 'error';

interface InstallStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'done' | 'skipped';
}

function buildSteps(needsVsCode: boolean): InstallStep[] {
  const steps: InstallStep[] = [];
  if (needsVsCode) {
    steps.push({ id: 'download', label: 'Downloading Visual Studio Code', status: 'pending' });
  }
  steps.push({ id: 'extension', label: 'Installing Storyline extension', status: 'pending' });
  steps.push({ id: 'ready',     label: 'Ready to launch',                status: 'pending' });
  return steps;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [vsCodeDetected, setVsCodeDetected] = useState<boolean | null>(null);
  const [steps, setSteps] = useState<InstallStep[]>([]);
  const [percent, setPercent] = useState(0);
  const [message, setMessage] = useState('Setting things up…');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<boolean>('check_vscode')
      .then(setVsCodeDetected)
      .catch(() => setVsCodeDetected(false));
  }, []);

  const setStep = (id: string, status: InstallStep['status']) => {
    setSteps(prev => prev.map(s => (s.id === id ? { ...s, status } : s)));
  };

  const startInstall = async () => {
    const needsVsCode = vsCodeDetected === false;
    const initial = buildSteps(needsVsCode);
    setSteps(initial);
    setPercent(0);
    setMessage(needsVsCode ? 'Preparing to download Visual Studio Code…' : 'Installing Storyline extension…');
    setScreen('progress');

    let unlistenProgress: UnlistenFn | null = null;
    let unlistenPhase: UnlistenFn | null = null;

    try {
      unlistenProgress = await listen<number>('vscode-download-progress', e => {
        // Map 0–100 of the download to 0–70 of overall progress when VS Code is downloading.
        const dl = Math.max(0, Math.min(100, Number(e.payload) || 0));
        if (needsVsCode) {
          setPercent(Math.round(dl * 0.7));
          setMessage(dl < 100
            ? `Downloading Visual Studio Code… ${dl}%`
            : 'Visual Studio Code downloaded.');
        }
      });

      unlistenPhase = await listen<string>('install-phase', e => {
        const phase = String(e.payload);
        if (phase === 'download') {
          setStep('download', 'active');
          setMessage('Downloading Visual Studio Code…');
        } else if (phase === 'extension') {
          setStep('download', 'done');
          setStep('extension', 'active');
          setPercent(needsVsCode ? 80 : 50);
          setMessage('Installing Storyline extension…');
        } else if (phase === 'done') {
          setStep('extension', 'done');
          setStep('ready', 'done');
          setPercent(100);
          setMessage('All set.');
        }
      });

      await invoke('install_storyline');
      setScreen('done');
    } catch (e) {
      setError(String(e));
      setScreen('error');
    } finally {
      if (unlistenProgress) unlistenProgress();
      if (unlistenPhase) unlistenPhase();
    }
  };

  if (screen === 'welcome') {
    return <Welcome vsCodeDetected={vsCodeDetected} onInstall={startInstall} />;
  }

  if (screen === 'progress') {
    return <Progress steps={steps} message={message} percent={percent} />;
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
