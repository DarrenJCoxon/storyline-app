interface WelcomeProps {
  vsCodeDetected: boolean | null;
  onInstall: () => void;
}

export default function Welcome({ vsCodeDetected, onInstall }: WelcomeProps) {
  const dotClass =
    vsCodeDetected === null ? 'dot' :
    vsCodeDetected           ? 'dot found' : 'dot not-found';

  const statusText =
    vsCodeDetected === null ? 'Checking for Visual Studio Code…' :
    vsCodeDetected
      ? 'Visual Studio Code found — will install extension only'
      : 'Visual Studio Code not found — will download and install';

  return (
    <div className="welcome-screen">
      <div className="wordmark">
        <div className="logo-mark">S</div>
        <h1>Storyline</h1>
      </div>
      <p className="tagline">A writing environment built for novelists</p>

      <div className="vscode-status">
        <span className={dotClass} />
        {statusText}
        {vsCodeDetected === null && <span className="spinner" />}
      </div>

      <div className="welcome-cta">
        <button
          className="btn-primary"
          onClick={onInstall}
          disabled={vsCodeDetected === null}
        >
          Install Storyline
        </button>
      </div>

      <p className="welcome-fine-print">
        Storyline runs on top of Visual Studio Code — a free, trusted editor used by
        millions of writers and developers. You'll end up with both VS Code and Storyline
        in your Applications folder.
      </p>
    </div>
  );
}
