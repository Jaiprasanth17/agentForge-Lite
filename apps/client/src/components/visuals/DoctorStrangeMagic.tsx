/**
 * DoctorStrangeMagic - Doctor Strange silhouette with magical glyph animation
 * Pure SVG + CSS animation (no external assets needed)
 */

import { useEffect, useRef } from "react";

/* ------------------------------------------------------------------ */
/*  Magic circle (rotating mystical glyphs)                            */
/* ------------------------------------------------------------------ */
function MagicCircle({ size, delay, speed, opacity }: { size: number; delay: number; speed: number; opacity: number }) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ animationDelay: `${delay}s` }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 200 200"
        className="animate-spin"
        style={{
          animationDuration: `${speed}s`,
          animationTimingFunction: "linear",
          opacity,
        }}
      >
        {/* Outer circle */}
        <circle cx="100" cy="100" r="95" fill="none" stroke="#ff8800" strokeWidth="1" opacity="0.6" />
        <circle cx="100" cy="100" r="90" fill="none" stroke="#ffaa33" strokeWidth="0.5" opacity="0.4"
          strokeDasharray="8 4" />

        {/* Rune segments */}
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i * 30 * Math.PI) / 180;
          const x1 = 100 + 85 * Math.cos(angle);
          const y1 = 100 + 85 * Math.sin(angle);
          const x2 = 100 + 70 * Math.cos(angle);
          const y2 = 100 + 70 * Math.sin(angle);
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="#ffaa33" strokeWidth="1.5" opacity="0.7" />
          );
        })}

        {/* Inner decorative circle */}
        <circle cx="100" cy="100" r="65" fill="none" stroke="#ff9922" strokeWidth="0.8"
          strokeDasharray="3 6" opacity="0.5" />

        {/* Triangle glyphs */}
        <polygon points="100,30 115,60 85,60" fill="none" stroke="#ffcc66" strokeWidth="1" opacity="0.6" />
        <polygon points="100,170 115,140 85,140" fill="none" stroke="#ffcc66" strokeWidth="1" opacity="0.6" />
        <polygon points="30,100 60,85 60,115" fill="none" stroke="#ffcc66" strokeWidth="1" opacity="0.6" />
        <polygon points="170,100 140,85 140,115" fill="none" stroke="#ffcc66" strokeWidth="1" opacity="0.6" />

        {/* Mystical symbols on the ring */}
        {Array.from({ length: 8 }).map((_, i) => {
          const angle = (i * 45 * Math.PI) / 180;
          const x = 100 + 78 * Math.cos(angle);
          const y = 100 + 78 * Math.sin(angle);
          return (
            <text key={`sym-${i}`} x={x} y={y} fill="#ffcc66" fontSize="8" textAnchor="middle"
              dominantBaseline="middle" opacity="0.7"
              style={{ fontFamily: "serif" }}>
              {["$", "\u2606", "\u2609", "\u263F", "\u2640", "\u2642", "\u2643", "\u2644"][i]}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Floating sparks / particles                                        */
/* ------------------------------------------------------------------ */
function MagicSparks() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            width: `${2 + Math.random() * 3}px`,
            height: `${2 + Math.random() * 3}px`,
            background: `radial-gradient(circle, ${
              ["#ff8800", "#ffaa33", "#ffcc66", "#ff6600"][i % 4]
            }, transparent)`,
            left: `${20 + Math.random() * 60}%`,
            top: `${20 + Math.random() * 60}%`,
            animation: `float-spark ${3 + Math.random() * 4}s ease-in-out infinite`,
            animationDelay: `${Math.random() * 3}s`,
            opacity: 0.6 + Math.random() * 0.4,
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Doctor Strange silhouette (stylized vector, not copyrighted)       */
/* ------------------------------------------------------------------ */
function StrangeSilhouette() {
  return (
    <svg viewBox="0 0 300 500" className="w-full h-full" style={{ filter: "drop-shadow(0 0 20px rgba(255,136,0,0.3))" }}>
      <defs>
        <linearGradient id="cloakGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#cc3333" />
          <stop offset="50%" stopColor="#991111" />
          <stop offset="100%" stopColor="#660000" />
        </linearGradient>
        <linearGradient id="bodyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#334466" />
          <stop offset="100%" stopColor="#1a2233" />
        </linearGradient>
        <radialGradient id="eyeGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#00ffcc" stopOpacity="1" />
          <stop offset="100%" stopColor="#00ffcc" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Cloak of Levitation */}
      <path d="M80,180 Q60,200 40,350 Q30,420 70,480 L120,480 Q100,400 110,300 L150,220 Z"
        fill="url(#cloakGrad)" opacity="0.9">
        <animateTransform attributeName="transform" type="rotate"
          values="-2,80,330;2,80,330;-2,80,330" dur="4s" repeatCount="indefinite" />
      </path>
      <path d="M220,180 Q240,200 260,350 Q270,420 230,480 L180,480 Q200,400 190,300 L150,220 Z"
        fill="url(#cloakGrad)" opacity="0.9">
        <animateTransform attributeName="transform" type="rotate"
          values="2,220,330;-2,220,330;2,220,330" dur="4s" repeatCount="indefinite" />
      </path>

      {/* Body / tunic */}
      <path d="M110,180 L120,480 L180,480 L190,180 Q150,170 110,180 Z"
        fill="url(#bodyGrad)" />

      {/* Collar high */}
      <path d="M100,170 Q110,140 150,135 Q190,140 200,170 Q190,180 150,175 Q110,180 100,170 Z"
        fill="#993333" stroke="#aa4444" strokeWidth="1" />

      {/* Head */}
      <ellipse cx="150" cy="115" rx="30" ry="35" fill="#2a1a0e" />

      {/* Hair (stylized) */}
      <path d="M120,105 Q125,75 150,70 Q175,75 180,105 Q175,90 150,85 Q125,90 120,105 Z"
        fill="#1a1a2a">
        <animate attributeName="d"
          values="M120,105 Q125,75 150,70 Q175,75 180,105 Q175,90 150,85 Q125,90 120,105 Z;
                  M118,105 Q123,73 150,68 Q177,73 182,105 Q175,88 150,83 Q125,88 118,105 Z;
                  M120,105 Q125,75 150,70 Q175,75 180,105 Q175,90 150,85 Q125,90 120,105 Z"
          dur="5s" repeatCount="indefinite" />
      </path>

      {/* White streak in hair */}
      <path d="M138,80 Q140,72 145,70 Q142,75 140,85 Z" fill="#888899" opacity="0.8" />

      {/* Eyes (glowing) */}
      <ellipse cx="140" cy="112" rx="4" ry="3" fill="#00ffcc">
        <animate attributeName="opacity" values="1;0.6;1" dur="3s" repeatCount="indefinite" />
      </ellipse>
      <ellipse cx="160" cy="112" rx="4" ry="3" fill="#00ffcc">
        <animate attributeName="opacity" values="1;0.6;1" dur="3s" repeatCount="indefinite" />
      </ellipse>

      {/* Goatee */}
      <path d="M143,128 Q150,140 157,128 Q153,135 150,138 Q147,135 143,128 Z"
        fill="#1a1a2a" opacity="0.7" />

      {/* Eye of Agamotto (amulet) */}
      <ellipse cx="150" cy="175" rx="12" ry="14" fill="#334400" stroke="#88aa00" strokeWidth="1.5" />
      <ellipse cx="150" cy="175" rx="6" ry="7" fill="#aacc00">
        <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite" />
      </ellipse>
      <circle cx="150" cy="175" r="3" fill="#ffff00">
        <animate attributeName="r" values="3;4;3" dur="2s" repeatCount="indefinite" />
      </circle>

      {/* Arms raised in casting pose */}
      <path d="M110,200 Q80,190 55,160 Q45,150 40,140"
        fill="none" stroke="url(#bodyGrad)" strokeWidth="12" strokeLinecap="round" />
      <path d="M190,200 Q220,190 245,160 Q255,150 260,140"
        fill="none" stroke="url(#bodyGrad)" strokeWidth="12" strokeLinecap="round" />

      {/* Hands (open, casting) */}
      <circle cx="38" cy="138" r="8" fill="#2a1a0e" />
      <circle cx="262" cy="138" r="8" fill="#2a1a0e" />

      {/* Casting glow from hands */}
      <circle cx="38" cy="138" r="15" fill="url(#eyeGlow)" opacity="0.4">
        <animate attributeName="r" values="12;18;12" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.4;0.7;0.4" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="262" cy="138" r="15" fill="url(#eyeGlow)" opacity="0.4">
        <animate attributeName="r" values="12;18;12" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.4;0.7;0.4" dur="2s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Exported component                                                 */
/* ------------------------------------------------------------------ */
export default function DoctorStrangeMagic({ className = "" }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Inject keyframes for spark animation
    const style = document.createElement("style");
    style.textContent = `
      @keyframes float-spark {
        0%, 100% { transform: translateY(0) translateX(0); opacity: 0.6; }
        25% { transform: translateY(-15px) translateX(8px); opacity: 1; }
        50% { transform: translateY(-25px) translateX(-5px); opacity: 0.8; }
        75% { transform: translateY(-10px) translateX(12px); opacity: 0.5; }
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Radial glow behind */}
      <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,136,0,0.15)_0%,transparent_70%)]" />

      {/* Magic circles */}
      <MagicCircle size={320} delay={0} speed={20} opacity={0.5} />
      <MagicCircle size={260} delay={0.5} speed={15} opacity={0.4} />
      <MagicCircle size={200} delay={1} speed={25} opacity={0.3} />

      {/* Sparks */}
      <MagicSparks />

      {/* Doctor Strange silhouette */}
      <div className="relative z-10 flex items-center justify-center h-full px-8 pt-4">
        <StrangeSilhouette />
      </div>
    </div>
  );
}
