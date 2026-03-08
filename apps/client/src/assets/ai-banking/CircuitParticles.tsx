/**
 * CircuitParticles - Animated circuit-board style background
 * Banking × AI themed with floating nodes, connecting lines, and data particles
 * Uses pure SVG + CSS animations for lightweight rendering
 */

import { useState, useEffect } from "react";

/* ------------------------------------------------------------------ */
/*  Circuit node grid with animated connections                        */
/* ------------------------------------------------------------------ */
function CircuitGrid() {
  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="circuitLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#14C1FF" stopOpacity="0" />
          <stop offset="50%" stopColor="#14C1FF" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#14C1FF" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="circuitLineV" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0F52BA" stopOpacity="0" />
          <stop offset="50%" stopColor="#0F52BA" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#0F52BA" stopOpacity="0" />
        </linearGradient>
        <filter id="nodeGlow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Horizontal circuit lines */}
      {[120, 280, 440, 560, 680].map((y, i) => (
        <line key={`h-${i}`} x1="0" y1={y} x2="1200" y2={y}
          stroke="url(#circuitLine)" strokeWidth="0.5" opacity={0.15 + (i % 2) * 0.1} />
      ))}

      {/* Vertical circuit lines */}
      {[150, 350, 550, 750, 950, 1100].map((x, i) => (
        <line key={`v-${i}`} x1={x} y1="0" x2={x} y2="800"
          stroke="url(#circuitLineV)" strokeWidth="0.5" opacity={0.12 + (i % 3) * 0.06} />
      ))}

      {/* Circuit junction nodes */}
      {[
        { x: 150, y: 120 }, { x: 550, y: 120 }, { x: 950, y: 120 },
        { x: 350, y: 280 }, { x: 750, y: 280 }, { x: 1100, y: 280 },
        { x: 150, y: 440 }, { x: 550, y: 440 }, { x: 950, y: 440 },
        { x: 350, y: 560 }, { x: 750, y: 560 },
        { x: 150, y: 680 }, { x: 550, y: 680 }, { x: 950, y: 680 },
      ].map((node, i) => (
        <g key={`node-${i}`}>
          {/* Node glow */}
          <circle cx={node.x} cy={node.y} r="6" fill="#14C1FF" opacity="0.08" filter="url(#nodeGlow)">
            <animate attributeName="r" values="4;8;4" dur={`${3 + (i % 3)}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.05;0.15;0.05" dur={`${3 + (i % 3)}s`} repeatCount="indefinite" />
          </circle>
          {/* Node dot */}
          <circle cx={node.x} cy={node.y} r="1.5" fill="#14C1FF" opacity={0.2 + (i % 4) * 0.08}>
            <animate attributeName="opacity"
              values={`${0.15 + (i % 4) * 0.05};${0.3 + (i % 4) * 0.1};${0.15 + (i % 4) * 0.05}`}
              dur={`${2 + (i % 5) * 0.5}s`} repeatCount="indefinite" />
          </circle>
        </g>
      ))}

      {/* Data pulse traveling along lines */}
      {[
        { x1: 150, y1: 120, x2: 550, y2: 120, dur: 4, delay: 0 },
        { x1: 350, y1: 280, x2: 750, y2: 280, dur: 5, delay: 1.5 },
        { x1: 550, y1: 440, x2: 950, y2: 440, dur: 4.5, delay: 3 },
        { x1: 150, y1: 120, x2: 150, y2: 440, dur: 6, delay: 0.5 },
        { x1: 950, y1: 120, x2: 950, y2: 680, dur: 7, delay: 2 },
        { x1: 550, y1: 120, x2: 550, y2: 680, dur: 8, delay: 1 },
      ].map((pulse, i) => (
        <circle key={`pulse-${i}`} r="2" fill="#00FFA3" opacity="0.6" filter="url(#nodeGlow)">
          <animateMotion
            path={`M${pulse.x1},${pulse.y1} L${pulse.x2},${pulse.y2}`}
            dur={`${pulse.dur}s`}
            begin={`${pulse.delay}s`}
            repeatCount="indefinite"
          />
          <animate attributeName="opacity" values="0;0.8;0.8;0" dur={`${pulse.dur}s`} begin={`${pulse.delay}s`} repeatCount="indefinite" />
        </circle>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Floating particles                                                 */
/* ------------------------------------------------------------------ */
function FloatingParticles() {
  const [particles] = useState(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 1 + Math.random() * 2.5,
      duration: 4 + Math.random() * 6,
      delay: Math.random() * 4,
      color: i % 5 === 0 ? "#00FFA3" : i % 3 === 0 ? "#FFD700" : "#14C1FF",
    }))
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            background: `radial-gradient(circle, ${p.color}, transparent)`,
            animation: `float-particle ${p.duration}s ease-in-out infinite`,
            animationDelay: `${p.delay}s`,
            opacity: 0,
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Exported component                                                 */
/* ------------------------------------------------------------------ */
export default function CircuitParticles() {
  useEffect(() => {
    const styleId = "circuit-particles-keyframes";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        @keyframes float-particle {
          0%, 100% { opacity: 0; transform: translateY(0) translateX(0); }
          20% { opacity: 0.6; }
          50% { opacity: 0.8; transform: translateY(-20px) translateX(10px); }
          80% { opacity: 0.4; }
        }
      `;
      document.head.appendChild(style);
    }
    return () => {
      const el = document.getElementById(styleId);
      if (el) el.remove();
    };
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <CircuitGrid />
      <FloatingParticles />
    </div>
  );
}
