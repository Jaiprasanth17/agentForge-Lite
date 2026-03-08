import { useEffect } from "react";
import HelpHero from "../components/help/HelpHero";
import HelpSteps from "../components/help/HelpSteps";
import HelpFAQ from "../components/help/HelpFAQ";
import HelpCTAs from "../components/help/HelpCTAs";
import { track } from "../lib/track";

export default function Help() {
  useEffect(() => {
    track("help_page_open");
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <HelpHero />

      <HelpSteps />

      <HelpFAQ />

      <HelpCTAs />
    </div>
  );
}
