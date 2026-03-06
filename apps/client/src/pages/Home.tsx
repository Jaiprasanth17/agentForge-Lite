import { useNavigate } from "react-router-dom";
import Lottie from "lottie-react";
import { useState } from "react";
import characterAnimation from "../assets/animations/character.json";

export default function Home() {
  const navigate = useNavigate();
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-dark-950 via-dark-900 to-dark-950" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.15),transparent_70%)]" />

      {/* Floating orbs */}
      <div className="absolute top-20 left-20 w-64 h-64 bg-accent/5 rounded-full blur-3xl animate-pulse-slow" />
      <div className="absolute bottom-20 right-20 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: "1.5s" }} />

      {/* Content */}
      <div className="relative z-10 text-center max-w-2xl px-6">
        {/* Animated Character */}
        <div
          className="w-96 h-48 mx-auto mb-8 cursor-pointer relative"
          onClick={() => setShowTooltip(!showTooltip)}
        >
          <Lottie
            animationData={characterAnimation}
            loop
            className="w-full h-full drop-shadow-2xl"
          />
          {showTooltip && (
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-dark-700 border border-dark-600 rounded-lg px-4 py-2 text-sm text-dark-200 whitespace-nowrap animate-fade-in shadow-xl">
              Hey there! Ready to build some AI agents? 
            </div>
          )}
        </div>

        <h1 className="text-5xl font-bold mb-4 animate-fade-in">
          <span className="bg-gradient-to-r from-accent-light via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Agentic Nexus
          </span>
        </h1>

        <p className="text-lg text-dark-300 mb-10 animate-slide-up max-w-lg mx-auto">
          Design, configure, and test AI agents with an intuitive visual builder.
          Choose your model, set capabilities, and run interactive conversations.
        </p>

        <div className="flex gap-4 justify-center animate-slide-up" style={{ animationDelay: "0.2s" }}>
          <button
            onClick={() => navigate("/agents/new")}
            className="btn-primary text-lg px-8 py-3 rounded-xl shadow-lg shadow-accent/20 hover:shadow-accent/30 hover:scale-105 transition-all duration-300"
          >
            Create Agent
          </button>
          <button
            onClick={() => navigate("/agents")}
            className="btn-secondary text-lg px-8 py-3 rounded-xl hover:scale-105 transition-all duration-300"
          >
            Open a Saved Agent
          </button>
        </div>

        {/* Feature highlights */}
        <div className="grid grid-cols-3 gap-6 mt-16 animate-slide-up" style={{ animationDelay: "0.4s" }}>
          {[
            { title: "Multi-Provider", desc: "OpenAI, Anthropic, or Mock" },
            { title: "Live Testing", desc: "Streaming WebSocket chat" },
            { title: "Tool Agents", desc: "Search, code, memory" },
          ].map((f) => (
            <div key={f.title} className="text-center p-4">
              <h3 className="text-sm font-semibold text-accent-light mb-1">{f.title}</h3>
              <p className="text-xs text-dark-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
