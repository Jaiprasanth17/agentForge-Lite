import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import DoctorStrangeMagic from "../components/visuals/DoctorStrangeMagic";
import ArcReactor3D from "../components/visuals/ArcReactor3D";

/* ------------------------------------------------------------------ */
/*  Starfield background                                               */
/* ------------------------------------------------------------------ */
function Starfield() {
  const [stars] = useState(() =>
    Array.from({ length: 80 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 1 + Math.random() * 2,
      duration: 3 + Math.random() * 5,
      delay: Math.random() * 3,
    }))
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {stars.map((s) => (
        <div
          key={s.id}
          className="absolute rounded-full bg-white"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            animation: `twinkle ${s.duration}s ease-in-out infinite`,
            animationDelay: `${s.delay}s`,
            opacity: 0,
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Home component                                                */
/* ------------------------------------------------------------------ */
export default function Home() {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Inject keyframes
    const styleId = "home-keyframes";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        @keyframes twinkle {
          0%, 100% { opacity: 0; transform: scale(0.5); }
          50% { opacity: 0.8; transform: scale(1); }
        }
        @keyframes neon-pulse {
          0%, 100% { text-shadow: 0 0 10px rgba(99,102,241,0.5), 0 0 20px rgba(99,102,241,0.3), 0 0 40px rgba(99,102,241,0.1); }
          50% { text-shadow: 0 0 20px rgba(99,102,241,0.8), 0 0 40px rgba(99,102,241,0.5), 0 0 80px rgba(99,102,241,0.2); }
        }
        @keyframes glow-border {
          0%, 100% { box-shadow: 0 0 5px rgba(0,180,255,0.3), inset 0 0 5px rgba(0,180,255,0.1); }
          50% { box-shadow: 0 0 15px rgba(0,180,255,0.5), inset 0 0 10px rgba(0,180,255,0.2); }
        }
        @keyframes float-gentle {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
      `;
      document.head.appendChild(style);
    }
    return () => {
      const el = document.getElementById(styleId);
      if (el) el.remove();
    };
  }, []);

  const features = [
    { icon: "\uD83C\uDF10", title: "Multi-Provider", desc: "OpenAI, Anthropic, or Mock", gradient: "from-blue-500/20 to-cyan-500/20" },
    { icon: "\u26A1", title: "Live Testing", desc: "Streaming WebSocket chat", gradient: "from-purple-500/20 to-pink-500/20" },
    { icon: "\uD83D\uDEE0", title: "Tool Agents", desc: "Search, code, memory", gradient: "from-amber-500/20 to-orange-500/20" },
  ];

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      {/* Background layers */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a1a] via-[#0d1025] to-[#0a0a1a]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(99,102,241,0.12),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(0,180,255,0.08),transparent_50%)]" />
      <Starfield />

      {/* Hero section */}
      <div className="relative z-10 flex-1 flex flex-col">
        <div className="flex-1 flex items-center justify-center px-4 md:px-8 lg:px-12 py-8">
          <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-[1fr_2fr_1fr] gap-4 lg:gap-8 items-center">

            {/* Left: Doctor Strange */}
            <div className={`hidden lg:flex items-center justify-center transition-all duration-1000 ${mounted ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-12"}`}>
              <DoctorStrangeMagic className="w-72 h-96" />
            </div>

            {/* Center: Content */}
            <div className="flex flex-col items-center text-center">
              {/* Mobile: Small Doctor Strange above title */}
              <div className="lg:hidden flex justify-center mb-4">
                <DoctorStrangeMagic className="w-40 h-52" />
              </div>

              {/* Title with neon glow */}
              <h1
                className={`text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-4 transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
                style={{ animation: mounted ? "neon-pulse 3s ease-in-out infinite" : "none" }}
              >
                <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-500 bg-clip-text text-transparent">
                  Agentic Nexus
                </span>
              </h1>

              <p className={`text-base sm:text-lg text-gray-400 mb-8 max-w-lg mx-auto leading-relaxed transition-all duration-700 delay-200 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
                Design, configure, and test AI agents with an intuitive visual builder.
                Choose your model, set capabilities, and run interactive conversations.
              </p>

              {/* CTA Buttons */}
              <div className={`flex flex-col sm:flex-row gap-4 justify-center mb-12 transition-all duration-700 delay-300 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
                <button
                  onClick={() => navigate("/agents/new")}
                  className="group relative px-8 py-3.5 rounded-xl text-lg font-semibold text-white overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-[0_0_30px_rgba(99,102,241,0.4)]"
                  style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)" }}
                >
                  <span className="relative z-10">Create Agent</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </button>
                <button
                  onClick={() => navigate("/agents")}
                  className="group relative px-8 py-3.5 rounded-xl text-lg font-semibold text-gray-300 border border-gray-600/50 overflow-hidden transition-all duration-300 hover:scale-105 hover:border-cyan-400/50 hover:text-white hover:shadow-[0_0_20px_rgba(0,180,255,0.2)]"
                  style={{ background: "rgba(255,255,255,0.03)", backdropFilter: "blur(10px)" }}
                >
                  <span className="relative z-10">Open a Saved Agent</span>
                </button>
              </div>

              {/* Mobile: Small Arc Reactor */}
              <div className="lg:hidden flex justify-center mb-8">
                <div className="w-48 h-48">
                  <ArcReactor3D className="w-full h-full" />
                </div>
              </div>

              {/* Feature cards with glassmorphism */}
              <div className={`grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-xl transition-all duration-700 delay-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
                {features.map((f, i) => (
                  <div
                    key={f.title}
                    className="group relative rounded-xl p-4 border border-gray-700/30 transition-all duration-300 hover:border-cyan-400/30 hover:scale-105 cursor-default"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      backdropFilter: "blur(12px)",
                      animation: mounted ? `glow-border 4s ease-in-out infinite` : "none",
                      animationDelay: `${i * 0.5}s`,
                    }}
                  >
                    <div className={`absolute inset-0 rounded-xl bg-gradient-to-br ${f.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
                    <div className="relative z-10">
                      <div className="text-2xl mb-2">{f.icon}</div>
                      <h3 className="text-sm font-semibold text-cyan-300 mb-1">{f.title}</h3>
                      <p className="text-xs text-gray-500">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Arc Reactor */}
            <div className={`hidden lg:flex items-center justify-center transition-all duration-1000 ${mounted ? "opacity-100 translate-x-0" : "opacity-0 translate-x-12"}`}>
              <div className="w-72 h-72 xl:w-80 xl:h-80" style={{ animation: "float-gentle 6s ease-in-out infinite" }}>
                <ArcReactor3D className="w-full h-full" />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom holographic bar */}
        <div className="relative z-10 py-4">
          <div className="max-w-3xl mx-auto px-4">
            <div className="h-px w-full" style={{ background: "linear-gradient(90deg, transparent, rgba(0,180,255,0.3), rgba(99,102,241,0.3), transparent)" }} />
            <p className="text-center text-xs text-gray-600 mt-3">Powered by advanced AI orchestration</p>
          </div>
        </div>
      </div>
    </div>
  );
}
