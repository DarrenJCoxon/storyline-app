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
    let downloadTimer: ReturnType<typeof setInterval> | null = null;

    // Simulated download progress driven entirely by the frontend. The Rust
    // side emits coarse milestones (5/70/88/100); the JS interpolates
    // smoothly between them so the bar is always moving. Asymptotes at 65%
    // of the download phase so it never reaches 100% before extraction.
    const startDownloadAnimation = () => {
      const start = Date.now();
      const ESTIMATED_MS = 60_000;
      downloadTimer = setInterval(() => {
        const elapsed = Date.now() - start;
        const fakeDl = Math.min(95, (elapsed / ESTIMATED_MS) * 100);
        setPercent(Math.round(fakeDl * 0.7));
        setMessage(`Downloading Visual Studio Code… ${Math.round(fakeDl)}%`);
        setSubtext(`About 115 MB · ${formatElapsed(elapsed)}`);
      }, 500);
    };
    const stopDownloadAnimation = () => {
      if (downloadTimer) { clearInterval(downloadTimer); downloadTimer = null; }
    };

    try {
      unlistenProgress = await listen<number>('vscode-download-progress', e => {
        // Rust milestones — only used to nudge the bar at extraction/install
        // boundaries. The smooth animation owns 0–65 of overall progress
        // during the download phase.
        const dl = Math.max(0, Math.min(100, Number(e.payload) || 0));
        if (needsVsCode && dl >= 70) {
          stopDownloadAnimation();
          setPercent(Math.round(dl * 0.7));
          setMessage(dl < 100 ? 'Visual Studio Code downloaded — extracting…' : 'Visual Studio Code installed.');
          setSubtext(undefined);
        }
      });

      unlistenPhase = await listen<string>('install-phase', e => {
        const phase = String(e.payload);
        if (phase === 'download') {
          setStep('download', 'active');
          setMessage('Downloading Visual Studio Code…');
          startDownloadAnimation();
        } else if (phase === 'extension') {
          stopDownloadAnimation();
          setStep('download', 'done');
          setStep('extension', 'active');
          setPercent(needsVsCode ? 80 : 50);
          setMessage('Installing Storyline extension…');
          setSubtext(undefined);
        } else if (phase === 'done') {
          stopDownloadAnimation();
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
      stopDownloadAnimation();
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
