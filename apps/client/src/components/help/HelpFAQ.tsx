import { useState } from "react";
import { helpCopy } from "./help.copy";
import { track } from "../../lib/track";

export default function HelpFAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (index: number) => {
    const next = openIndex === index ? null : index;
    setOpenIndex(next);
    if (next !== null) {
      track("help_faq_open", { question: helpCopy.faq[index].question });
    }
  };

  return (
    <div className="mb-10">
      <h2 className="text-xl font-semibold text-dark-100 mb-6">
        Frequently Asked Questions
      </h2>

      <div className="space-y-2">
        {helpCopy.faq.map((item, i) => (
          <div key={i} className="card !p-0 overflow-hidden">
            <button
              onClick={() => toggle(i)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-dark-800/50 transition-colors"
              aria-expanded={openIndex === i}
              aria-controls={`faq-answer-${i}`}
            >
              <span className="text-sm font-medium text-dark-100">
                {item.question}
              </span>
              <svg
                className={`w-4 h-4 text-dark-400 shrink-0 ml-3 transition-transform duration-200 ${
                  openIndex === i ? "rotate-180" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            <div
              id={`faq-answer-${i}`}
              role="region"
              className={`overflow-hidden transition-all duration-200 ${
                openIndex === i ? "max-h-96" : "max-h-0"
              }`}
            >
              <div className="px-4 pb-4 text-sm text-dark-400 leading-relaxed border-t border-dark-700">
                <p className="pt-3">{item.answer}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
