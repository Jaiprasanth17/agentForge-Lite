import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import BankingRobot from "../assets/ai-banking/BankingRobot";
import CircuitParticles from "../assets/ai-banking/CircuitParticles";

/* ------------------------------------------------------------------ */
/*  Main Home component — Banking x AI Theme                           */
/* ------------------------------------------------------------------ */
export default function Home() {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const styleId = "home-banking-keyframes";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        @keyframes banking-neon-pulse {
          0%, 100% {
            text-shadow:
              0 0 10px rgba(20,193,255,0.4),
              0 0 20px rgba(15,82,186,0.3),
              0 0 40px rgba(20,193,255,0.1);
          }
          50% {
            text-shadow:
              0 0 20px rgba(20,193,255,0.7),
              0 0 40px rgba(15,82,186,0.5),
              0 0 80px rgba(0,255,163,0.2);
          }
        }
        @keyframes card-glow-banking {
          0%, 100% {
            box-shadow: 0 0 8px rgba(20,193,255,0.15), inset 0 0 8px rgba(20,193,255,0.05);
          }
          50% {
            box-shadow: 0 0 20px rgba(20,193,255,0.3), inset 0 0 12px rgba(20,193,255,0.1);
          }
        }
        @keyframes float-banking {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        @keyframes shimmer-line {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
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
    {
      icon: "\uD83C\uDF10",
      title: "Multi-Provider",
      desc: "OpenAI, Anthropic, or Mock",
      border: "border-[#14C1FF]/20 hover:border-[#14C1FF]/50",
      glow: "from-[#0F52BA]/20 to-[#14C1FF]/20",
    },
    {
      icon: "\u26A1",
      title: "Live Testing",
      desc: "Streaming WebSocket chat",
      border: "border-[#00FFA3]/20 hover:border-[#00FFA3]/50",
      glow: "from-[#00FFA3]/20 to-[#14C1FF]/20",
    },
    {
      icon: "\uD83D\uDEE0\uFE0F",
      title: "Tool Agents",
      desc: "Search, code, memory",
      border: "border-[#FFD700]/20 hover:border-[#FFD700]/50",
      glow: "from-[#FFD700]/20 to-[#FFA500]/20",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      {/* ============ BACKGROUND LAYERS ============ */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#040d1a] via-[#0A1A3F] to-[#061225]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(15,82,186,0.18),transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(20,193,255,0.1),transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,255,163,0.04),transparent_60%)]" />
      <CircuitParticles />

      {/* ============ HERO CONTENT ============ */}
      <div className="relative z-10 flex-1 flex flex-col">
        <div className="flex-1 flex items-center justify-center px-4 md:px-8 lg:px-12 py-6">
          <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6 lg:gap-12 items-center">

            {/* ---- LEFT COLUMN: Content ---- */}
            <div className="flex flex-col items-center lg:items-start text-center lg:text-left order-2 lg:order-1">

              {/* Tagline badge */}
              <div
                className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6 transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
                style={{
                  background: "rgba(20,193,255,0.08)",
                  border: "1px solid rgba(20,193,255,0.2)",
                  backdropFilter: "blur(10px)",
                }}
              >
                <span className="w-2 h-2 rounded-full bg-[#00FFA3] animate-pulse" />
                <span className="text-xs font-medium text-[#14C1FF] tracking-wider uppercase">
                  AI-Powered Banking Intelligence
                </span>
              </div>

              {/* Title with banking neon glow */}
              <h1
                className={`text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold mb-5 leading-tight transition-all duration-700 delay-100 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
                style={{ animation: mounted ? "banking-neon-pulse 4s ease-in-out infinite" : "none" }}
              >
                <span className="bg-gradient-to-r from-[#14C1FF] via-[#0F52BA] to-[#00FFA3] bg-clip-text text-transparent">
                  Agentic
                </span>
                <br />
                <span className="bg-gradient-to-r from-[#FFD700] via-[#14C1FF] to-[#0F52BA] bg-clip-text text-transparent">
                  Nexus
                </span>
              </h1>

              {/* Subtitle */}
              <p
                className={`text-base sm:text-lg text-gray-400 mb-8 max-w-md leading-relaxed transition-all duration-700 delay-200 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
              >
                Design, configure, and test AI agents with an intuitive visual builder.
                Choose your model, set capabilities, and run interactive conversations.
              </p>

              {/* CTA Buttons */}
              <div
                className={`flex flex-col sm:flex-row gap-4 mb-10 transition-all duration-700 delay-300 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
              >
                <button
                  onClick={() => navigate("/agents/new")}
                  className="group relative px-8 py-3.5 rounded-xl text-lg font-semibold text-white overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-[0_0_30px_rgba(20,193,255,0.4)]"
                  style={{ background: "linear-gradient(135deg, #0F52BA, #14C1FF)" }}
                >
                  <span className="relative z-10">Create Agent</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-[#00FFA3] to-[#14C1FF] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </button>
                <button
                  onClick={() => navigate("/agents")}
                  className="group relative px-8 py-3.5 rounded-xl text-lg font-semibold text-gray-300 border border-[#14C1FF]/30 overflow-hidden transition-all duration-300 hover:scale-105 hover:border-[#14C1FF]/60 hover:text-white hover:shadow-[0_0_20px_rgba(20,193,255,0.2)]"
                  style={{ background: "rgba(10,26,63,0.5)", backdropFilter: "blur(10px)" }}
                >
                  <span className="relative z-10">Open a Saved Agent</span>
                </button>
              </div>

              {/* Feature cards */}
              <div
                className={`grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-lg transition-all duration-700 delay-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
              >
                {features.map((f, i) => (
                  <div
                    key={f.title}
                    className={`group relative rounded-xl p-4 border ${f.border} transition-all duration-300 hover:scale-105 cursor-default`}
                    style={{
                      background: "rgba(10,26,63,0.6)",
                      backdropFilter: "blur(12px)",
                      animation: mounted ? "card-glow-banking 4s ease-in-out infinite" : "none",
                      animationDelay: `${i * 0.6}s`,
                    }}
                  >
                    <div
                      className={`absolute inset-0 rounded-xl bg-gradient-to-br ${f.glow} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}
                    />
                    <div className="relative z-10">
                      <div className="text-2xl mb-2">{f.icon}</div>
                      <h3 className="text-sm font-semibold text-[#14C1FF] mb-1">{f.title}</h3>
                      <p className="text-xs text-gray-500">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ---- RIGHT COLUMN: Banking Robot Character ---- */}
            <div
              className={`flex items-center justify-center order-1 lg:order-2 transition-all duration-1000 ${mounted ? "opacity-100 translate-y-0 lg:translate-x-0" : "opacity-0 translate-y-8 lg:translate-x-12"}`}
            >
              <div
                className="w-64 h-80 sm:w-72 sm:h-96 lg:w-[360px] lg:h-[460px] xl:w-[420px] xl:h-[520px]"
                style={{ animation: mounted ? "float-banking 5s ease-in-out infinite" : "none" }}
              >
                <BankingRobot className="w-full h-full" />
              </div>
            </div>

          </div>
        </div>

        {/* ============ BOTTOM BAR ============ */}
        <div className="relative z-10 py-4">
          <div className="max-w-3xl mx-auto px-4">
            <div
              className="h-px w-full"
              style={{
                background: "linear-gradient(90deg, transparent, rgba(20,193,255,0.4), rgba(0,255,163,0.3), rgba(255,215,0,0.2), transparent)",
                backgroundSize: "200% 100%",
                animation: "shimmer-line 4s linear infinite",
              }}
            />
            <p className="text-center text-xs text-gray-600 mt-3 tracking-wide">
              Powered by advanced AI orchestration
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
