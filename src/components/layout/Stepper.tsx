const STEPS = ['Upload', 'Configure', 'Review', 'Download', 'Test Scripts', 'Try It Out'];

interface StepperProps {
  current: number;
  onStepClick: (step: number) => void;
  canAdvance: boolean[];
}

export function Stepper({ current, onStepClick, canAdvance }: StepperProps) {
  return (
    <nav className="stepper">
      {STEPS.map((label, idx) => {
        const isActive = idx === current;
        const isCompleted = idx < current;
        const isClickable = idx <= current || canAdvance.slice(0, idx).every(Boolean);

        return (
          <button
            key={label}
            className={`stepper-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
            onClick={() => isClickable && onStepClick(idx)}
            disabled={!isClickable}
          >
            <span className="stepper-number">{isCompleted ? '\u2713' : idx + 1}</span>
            <span className="stepper-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
