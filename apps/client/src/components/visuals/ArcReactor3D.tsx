/**
 * ArcReactor3D - JARVIS-inspired arc reactor animation
 * Pure SVG + CSS animation (no external 3D dependencies needed)
 * Creates a layered rotating reactor with neon blue glow
 */

import { useEffect } from "react";

/* ------------------------------------------------------------------ */
/*  Exported component                                                 */
/* ------------------------------------------------------------------ */
export default function ArcReactor3D({ className = "" }: { className?: string }) {
  useEffect(() => {
    const styleId = "arc-reactor-keyframes";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        @keyframes arc-spin-cw { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes arc-spin-ccw { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
        @keyframes arc-core-pulse {
          0%, 100% { r: 18; opacity: 1; }
          50% { r: 22; opacity: 0.8; }
        }
        @keyframes arc-glow-pulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.08); }
        }
        @keyframes arc-particle-orbit {
          0% { transform: rotate(0deg) translateX(var(--orbit-r)) rotate(0deg); opacity: 0.4; }
          25% { opacity: 1; }
          50% { opacity: 0.6; }
          75% { opacity: 1; }
          100% { transform: rotate(360deg) translateX(var(--orbit-r)) rotate(-360deg); opacity: 0.4; }
        }
      `;
      document.head.appendChild(style);
    }
    return () => {
      const el = document.getElementById(styleId);
      if (el) el.remove();
    };
  }, []);

  const size = 300;
  const cx = size / 2;
  const cy = size / 2;

  // Generate segment arcs for each ring
  const makeSegments = (r: number, count: number, gap: number) => {
    const segs: string[] = [];
    const segAngle = 360 / count;
    const arcAngle = segAngle - gap;
    for (let i = 0; i < count; i++) {
      const start = i * segAngle;
      const end = start + arcAngle;
      const startRad = (start * Math.PI) / 180;
      const endRad = (end * Math.PI) / 180;
      const x1 = cx + r * Math.cos(startRad);
      const y1 = cy + r * Math.sin(startRad);
      const x2 = cx + r * Math.cos(endRad);
      const y2 = cy + r * Math.sin(endRad);
      const largeArc = arcAngle > 180 ? 1 : 0;
      segs.push(`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`);
    }
    return segs.join(" ");
  };

  // Generate energy particles at different orbits
  const particles = Array.from({ length: 16 }, (_, i) => ({
    id: i,
    orbitR: 40 + (i % 4) * 22,
    size: 2 + Math.random() * 2,
    duration: 6 + Math.random() * 8,
    delay: Math.random() * 5,
  }));

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      {/* Outer glow aura */}
      <div
        className="absolute rounded-full"
        style={{
          width: "100%",
          height: "100%",
          background: "radial-gradient(circle, rgba(0,180,255,0.25) 0%, rgba(0,100,255,0.1) 40%, transparent 70%)",
          animation: "arc-glow-pulse 3s ease-in-out infinite",
        }}
      />

      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-full h-full"
        style={{ filter: "drop-shadow(0 0 15px rgba(0,180,255,0.5))" }}
      >
        <defs>
          <radialGradient id="coreGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="30%" stopColor="#80e0ff" stopOpacity="1" />
            <stop offset="70%" stopColor="#00b4ff" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#0066ff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#00d4ff" stopOpacity="0" />
          </radialGradient>
          <filter id="arcBlur">
            <feGaussianBlur stdDeviation="2" />
          </filter>
          <filter id="arcBlurHeavy">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>

        {/* ── Outer ring 3 (slow CW) ── */}
        <g style={{ animation: "arc-spin-cw 30s linear infinite", transformOrigin: `${cx}px ${cy}px` }}>
          <path
            d={makeSegments(130, 20, 6)}
            fill="none" stroke="#0055aa" strokeWidth="1.5" opacity="0.5"
          />
          {/* Outer tick marks */}
          {Array.from({ length: 36 }).map((_, i) => {
            const angle = (i * 10 * Math.PI) / 180;
            const x1 = cx + 125 * Math.cos(angle);
            const y1 = cy + 125 * Math.sin(angle);
            const x2 = cx + 132 * Math.cos(angle);
            const y2 = cy + 132 * Math.sin(angle);
            return <line key={`t3-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#0077cc" strokeWidth="1" opacity="0.4" />;
          })}
        </g>

        {/* ── Outer ring 2 (medium CCW) ── */}
        <g style={{ animation: "arc-spin-ccw 22s linear infinite", transformOrigin: `${cx}px ${cy}px` }}>
          <path
            d={makeSegments(110, 12, 8)}
            fill="none" stroke="#0088dd" strokeWidth="2" opacity="0.6"
          />
          <circle cx={cx} cy={cy} r={110} fill="none" stroke="#0066bb" strokeWidth="0.5" strokeDasharray="2 8" opacity="0.3" />
        </g>

        {/* ── Middle ring (fast CW) ── */}
        <g style={{ animation: "arc-spin-cw 15s linear infinite", transformOrigin: `${cx}px ${cy}px` }}>
          <path
            d={makeSegments(90, 8, 10)}
            fill="none" stroke="#00aaff" strokeWidth="2.5" opacity="0.7"
          />
          <path
            d={makeSegments(90, 8, 10)}
            fill="none" stroke="#00ccff" strokeWidth="4" opacity="0.2" filter="url(#arcBlur)"
          />
        </g>

        {/* ── Inner ring (medium CCW) ── */}
        <g style={{ animation: "arc-spin-ccw 18s linear infinite", transformOrigin: `${cx}px ${cy}px` }}>
          <path
            d={makeSegments(70, 6, 12)}
            fill="none" stroke="#00ccff" strokeWidth="2.5" opacity="0.8"
          />
          <path
            d={makeSegments(70, 6, 12)}
            fill="none" stroke="#00eeff" strokeWidth="5" opacity="0.15" filter="url(#arcBlur)"
          />
        </g>

        {/* ── Innermost ring (fast CW) ── */}
        <g style={{ animation: "arc-spin-cw 10s linear infinite", transformOrigin: `${cx}px ${cy}px` }}>
          <path
            d={makeSegments(50, 4, 15)}
            fill="none" stroke="#44ddff" strokeWidth="3" opacity="0.85"
          />
          <path
            d={makeSegments(50, 4, 15)}
            fill="none" stroke="#66eeff" strokeWidth="6" opacity="0.2" filter="url(#arcBlur)"
          />
        </g>

        {/* ── Static decorative circles ── */}
        <circle cx={cx} cy={cy} r={42} fill="none" stroke="#0088cc" strokeWidth="0.5" opacity="0.4" />
        <circle cx={cx} cy={cy} r={95} fill="none" stroke="#0077bb" strokeWidth="0.5" opacity="0.3" />
        <circle cx={cx} cy={cy} r={120} fill="none" stroke="#005599" strokeWidth="0.5" opacity="0.25" />
        <circle cx={cx} cy={cy} r={138} fill="none" stroke="#004488" strokeWidth="0.5" opacity="0.2" />

        {/* ── Core glow (outer) ── */}
        <circle cx={cx} cy={cy} r={35} fill="url(#coreGlow)" opacity="0.6" filter="url(#arcBlurHeavy)">
          <animate attributeName="r" values="32;38;32" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.6;0.9;0.6" dur="2s" repeatCount="indefinite" />
        </circle>

        {/* ── Core (bright center) ── */}
        <circle cx={cx} cy={cy} r={18} fill="url(#coreGrad)">
          <animate attributeName="r" values="18;22;18" dur="2s" repeatCount="indefinite" />
        </circle>

        {/* ── Core highlight ── */}
        <circle cx={cx} cy={cy} r={8} fill="white" opacity="0.9">
          <animate attributeName="opacity" values="0.9;0.5;0.9" dur="2s" repeatCount="indefinite" />
        </circle>

        {/* ── Energy particles ── */}
        {particles.map((p) => (
          <circle
            key={p.id}
            cx={cx}
            cy={cy - p.orbitR}
            r={p.size}
            fill="#00d4ff"
            opacity="0.7"
            style={{
              transformOrigin: `${cx}px ${cy}px`,
              "--orbit-r": `${p.orbitR}px`,
              animation: `arc-particle-orbit ${p.duration}s linear infinite`,
              animationDelay: `${p.delay}s`,
            } as React.CSSProperties & Record<string, string>}
          />
        ))}
      </svg>
    </div>
  );
}
