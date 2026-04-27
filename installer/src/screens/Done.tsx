import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

export default function Done() {
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openStoryline = async () => {
    setLaunching(true);
    setError(null);
    try {
      await invoke('launch_vscode');
      // VS Code is opening — close the installer. A short delay lets the user
      // briefly see the success state and gives Launch Services time to start
      // bringing the new VS Code window forward before our window disappears.
      setTimeout(() => { void getCurrentWindow().close(); }, 600);
    } catch (e) {
      setError(String(e));
      setLaunching(false);
    }
  };

  return (
    <div className="done-screen">
      <div className="done-icon">✓</div>
      <h2>Storyline is ready</h2>
      <p>
        Visual Studio Code and the Storyline extension are installed.
        Click below to open your first writing session.
      </p>
      <button className="btn-primary" onClick={openStoryline} disabled={launching}>
        {launching ? 'Opening Storyline…' : 'Open Storyline →'}
      </button>
      {error && <p className="done-error">{error}</p>}
      <p className="powered-by">Powered by Visual Studio Code</p>
    </div>
  );
}
