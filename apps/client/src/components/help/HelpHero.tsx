import { helpCopy } from "./help.copy";

export default function HelpHero() {
  return (
    <div className="text-center mb-12">
      <h1 className="text-4xl font-bold mb-3">
        <span className="bg-gradient-to-r from-accent-light via-purple-400 to-pink-400 bg-clip-text text-transparent">
          {helpCopy.title}
        </span>
      </h1>
      <p className="text-lg text-dark-300 max-w-2xl mx-auto">
        {helpCopy.tagline}
      </p>
    </div>
  );
}
