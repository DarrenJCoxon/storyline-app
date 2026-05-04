type InstallStep = { id: string; label: string; status: 'pending' | 'active' | 'done' | 'skipped' };

interface ProgressProps {
  steps: InstallStep[];
  message: string;
  percent: number;
  subtext?: string;
}

const ICON: Record<InstallStep['status'], string> = {
  done:    '✓',
  active:  '●',
  pending: '○',
  skipped: '–',
};

export default function Progress({ steps, message, percent, subtext }: ProgressProps) {
  return (
    <div className="progress-screen">
      <p className="progress-heading">Setting up Storyline…</p>

      <ul className="step-list">
        {steps.map(step => (
          <li key={step.id} className={`step-item ${step.status}`}>
            <span className="step-icon">{ICON[step.status]}</span>
            <span className="step-label">{step.label}</span>
          </li>
        ))}
      </ul>

      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="progress-message">{message}</p>
      {subtext && <p className="progress-subtext">{subtext}</p>}
    </div>
  );
}
