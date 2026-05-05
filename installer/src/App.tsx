import { useState, useEffect, useRef } from 'react';
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

  // Refs for the download animation timer and "are we still downloading"
  // flag — used by event handlers registered at mount time.
  const downloadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const downloadingRef   = useRef(false);

  useEffect(() => {
    invoke<boolean>('check_vscode')
      .then(setVsCodeDetected)
      .catch(() => setVsCodeDetected(false));
  }, []);

  const setStep = (id: string, status: InstallStep['status']) => {
    setSteps(prev => prev.map(s => (s.id === id ? { ...s, status } : s)));
  };

  const stopDownloadAnimation = () => {
    if (downloadTimerRef.current) {
      clearInterval(downloadTimerRef.current);
      downloadTimerRef.current = null;
    }
    downloadingRef.current = false;
  };

  const startDownloadAnimation = () => {
    if (downloadTimerRef.current) return; // Already running
    downloadingRef.current = true;
    const start = Date.now();
    const ESTIMATED_MS = 60_000;
    downloadTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const fakeDl = Math.min(95, (elapsed / ESTIMATED_MS) * 100);
      setPercent(Math.round(fakeDl * 0.7));
      setMessage(`Downloading Visual Studio Code… ${Math.round(fakeDl)}%`);
      setSubtext(`About 115 MB · ${formatElapsed(elapsed)}`);
    }, 500);
  };

  // Register Rust event listeners ONCE on mount, before any user interaction.
  // Previously these were registered inside startInstall() which created a
  // race between the install command emitting "install-phase: download" and
  // the listen() registration completing — and made the UI freeze visibly
  // during the listen() round-trip on first launch.
  useEffect(() => {
    let unlistenProgress: UnlistenFn | null = null;
    let unlistenPhase: UnlistenFn | null = null;

    const setup = async () => {
      unlistenProgress = await listen<number>('vscode-download-progress', e => {
        const dl = Math.max(0, Math.min(100, Number(e.payload) || 0));
        if (downloadingRef.current && dl >= 70) {
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
          if (!downloadingRef.current) startDownloadAnimation();
        } else if (phase === 'extension') {
          stopDownloadAnimation();
          setStep('download', 'done');
          setStep('extension', 'active');
          setPercent(prev => Math.max(prev, 75));
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
    };

    void setup();
    return () => {
      if (unlistenProgress) unlistenProgress();
      if (unlistenPhase) unlistenPhase();
      stopDownloadAnimation();
    };
  }, []);

  const startInstall = async () => {
    const needsVsCode = vsCodeDetected === false;
    const initial = buildSteps(needsVsCode);
    setSteps(initial);
    setPercent(0);

    // Show progress UI and start the animation immediately so there's no
    // visible gap between click and bar movement, even if the Rust command
    // takes a moment to spin up.
    if (needsVsCode) {
      setStep('download', 'active');
      setMessage('Downloading Visual Studio Code…');
      setSubtext('About 115 MB · 0s elapsed');
      setScreen('progress');
      startDownloadAnimation();
    } else {
      setMessage('Installing Storyline extension…');
      setSubtext(undefined);
      setScreen('progress');
    }

    try {
      await invoke('install_storyline');
      setScreen('done');
    } catch (e) {
      setError(String(e));
      setScreen('error');
    } finally {
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
