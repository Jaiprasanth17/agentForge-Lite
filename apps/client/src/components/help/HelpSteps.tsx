import { useNavigate } from "react-router-dom";
import { helpCopy } from "./help.copy";

const STEP_ICONS: Record<string, string> = {
  agent: "\uD83E\uDD16",
  test: "\uD83E\uDDEA",
  workflow: "\u2699\uFE0F",
  trigger: "\u23F0",
  monitor: "\uD83D\uDCCA",
  iterate: "\uD83D\uDD04",
};

export default function HelpSteps() {
  const navigate = useNavigate();

  return (
    <div className="mb-10">
      <h2 className="text-xl font-semibold text-dark-100 mb-6">How It Works</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {helpCopy.steps.map((step) => (
          <div
            key={step.number}
            className="card hover:border-accent/30 transition-colors group"
          >
            <div className="flex items-start gap-3">
              <div className="text-2xl shrink-0 mt-0.5">
                {STEP_ICONS[step.icon] || "\u2B50"}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-bold text-accent-light bg-accent/10 px-2 py-0.5 rounded-full">
                    Step {step.number}
                  </span>
                  <h3 className="text-sm font-semibold text-dark-100">{step.title}</h3>
                </div>
                <p className="text-xs text-dark-400 leading-relaxed mb-3">
                  {step.description}
                </p>
                {step.link && (
                  <button
                    onClick={() => navigate(step.link!)}
                    className="text-xs text-accent-light hover:text-accent font-medium transition-colors"
                  >
                    {step.linkLabel} &rarr;
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
