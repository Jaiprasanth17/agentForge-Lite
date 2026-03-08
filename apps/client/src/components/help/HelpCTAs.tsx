import { useNavigate } from "react-router-dom";
import { helpCopy } from "./help.copy";

export default function HelpCTAs() {
  const navigate = useNavigate();
  const { cta } = helpCopy;

  return (
    <div className="card bg-gradient-to-r from-accent/5 to-purple-500/5 border-accent/20">
      <h2 className="text-lg font-semibold text-dark-100 mb-4">
        Ready to get started?
      </h2>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => navigate(cta.createAgent.to)}
          className="btn-primary px-6 py-2.5 rounded-xl"
        >
          {cta.createAgent.label}
        </button>
        <button
          onClick={() => navigate(cta.createWorkflow.to)}
          className="btn-secondary px-6 py-2.5 rounded-xl"
        >
          {cta.createWorkflow.label}
        </button>
        <a
          href={cta.docs.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium text-dark-300 bg-dark-800 hover:bg-dark-700 border border-dark-600 transition-colors"
        >
          {cta.docs.label}
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        </a>
      </div>
    </div>
  );
}
