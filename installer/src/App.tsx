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

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s elapsed`;
  return `${Math.floor(s / 60)}m ${s % 60}s elapsed`;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [vsCodeDetected, setVsCodeDetected] = useState<boolean | null>(null);
  const [steps, setSteps] = useState<InstallStep[]>([]);
  const [percent, setPercent] = useState(0);
  const [message, setMessage] = useState('Setting things up…');
  const [subtext, setSubtext] = useState<string | undefined>(undefined);
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
    setSubtext(needsVsCode ? 'About 115 MB. Typically 30 seconds to 2 minutes — please keep the installer open.' : undefined);
    setScreen('progress');

    let unlistenProgress: UnlistenFn | null = null;
    let unlistenPhase: UnlistenFn | null = null;
    let downloadStart = 0;
    let elapsedTimer: ReturnType<typeof setInterval> | null = null;

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
          // Start an elapsed-time ticker so users always see *something*
          // changing in the UI even if the download briefly stalls. The
          // shimmer animation handles the bar; this handles the text.
          downloadStart = Date.now();
          elapsedTimer = setInterval(() => {
            setSubtext(`About 115 MB · ${formatElapsed(Date.now() - downloadStart)}`);
          }, 1000);
        } else if (phase === 'extension') {
          setStep('download', 'done');
          setStep('extension', 'active');
          setPercent(needsVsCode ? 80 : 50);
          setMessage('Installing Storyline extension…');
          setSubtext(undefined);
          if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
        } else if (phase === 'done') {
          setStep('extension', 'done');
          setStep('ready', 'done');
          setPercent(100);
          setMessage('All set.');
          setSubtext(undefined);
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
      if (elapsedTimer) clearInterval(elapsedTimer);
    }
  };

  if (screen === 'welcome') {
    return <Welcome vsCodeDetected={vsCodeDetected} onInstall={startInstall} />;
  }

  if (screen === 'progress') {
    return <Progress steps={steps} message={message} percent={percent} subtext={subtext} />;
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
