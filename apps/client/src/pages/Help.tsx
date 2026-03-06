import { useEffect } from "react";
import HelpHero from "../components/help/HelpHero";
import HelpExplainer from "../components/help/HelpExplainer";
import HelpSteps from "../components/help/HelpSteps";
import HelpFAQ from "../components/help/HelpFAQ";
import HelpCTAs from "../components/help/HelpCTAs";
import { helpCopy } from "../components/help/help.copy";
import { track } from "../lib/track";
import agenticExplainer from "../assets/help/agentic_explainer.json";

export default function Help() {
  useEffect(() => {
    track("help_page_open");
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <HelpHero />

      <HelpExplainer
        title={helpCopy.explainer.title}
        lottieSrc={agenticExplainer}
        captionsSrc="/assets/help/agentic_explainer.vtt"
        alt={helpCopy.explainer.alt}
      />

      <HelpSteps />

      <HelpFAQ />

      <HelpCTAs />
    </div>
  );
}
