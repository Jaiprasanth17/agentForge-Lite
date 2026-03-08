/**
 * BankingRobot - AI Banking assistant character
 * Pure SVG + CSS animation inspired by the reference image:
 * Cute robot banker with cap, glowing blue eyes, holding coin + analytics tablet,
 * surrounded by banking elements (bank building, credit card, coin stacks, holographic dollar)
 */

import { useEffect } from "react";

export default function BankingRobot({ className = "" }: { className?: string }) {
  useEffect(() => {
    const styleId = "banking-robot-keyframes";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        @keyframes robot-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes eye-glow {
          0%, 100% { filter: drop-shadow(0 0 4px #14C1FF); }
          50% { filter: drop-shadow(0 0 10px #14C1FF) drop-shadow(0 0 20px #0F52BA); }
        }
        @keyframes coin-float {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          25% { transform: translateY(-4px) rotate(5deg); }
          75% { transform: translateY(2px) rotate(-3deg); }
        }
        @keyframes tablet-glow {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }
        @keyframes holo-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes holo-pulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 0.9; transform: scale(1.05); }
        }
        @keyframes badge-glow {
          0%, 100% { fill: #FFD700; }
          50% { fill: #FFA500; }
        }
        @keyframes card-shimmer {
          0% { opacity: 0.3; }
          50% { opacity: 0.6; }
          100% { opacity: 0.3; }
        }
        @keyframes stack-gleam {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
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
    <div className={`relative flex items-center justify-center ${className}`}>
      {/* Ambient glow behind robot */}
      <div
        className="absolute rounded-full"
        style={{
          width: "80%",
          height: "80%",
          background: "radial-gradient(circle, rgba(20,193,255,0.15) 0%, rgba(15,82,186,0.08) 50%, transparent 70%)",
          animation: "holo-pulse 4s ease-in-out infinite",
        }}
      />

      <svg viewBox="0 0 500 600" className="w-full h-full" style={{ animation: "robot-bob 4s ease-in-out infinite" }}>
        <defs>
          {/* Robot body gradient */}
          <linearGradient id="robotBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f0f4f8" />
            <stop offset="50%" stopColor="#dce4ec" />
            <stop offset="100%" stopColor="#c8d4e0" />
          </linearGradient>
          {/* Robot dark parts */}
          <linearGradient id="robotDark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2a3a4a" />
            <stop offset="100%" stopColor="#1a2535" />
          </linearGradient>
          {/* Eye glow */}
          <radialGradient id="eyeBlueGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="30%" stopColor="#80e8ff" stopOpacity="1" />
            <stop offset="70%" stopColor="#14C1FF" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#0F52BA" stopOpacity="0" />
          </radialGradient>
          {/* Gold gradient for coins */}
          <linearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFD700" />
            <stop offset="50%" stopColor="#FFC107" />
            <stop offset="100%" stopColor="#FF9800" />
          </linearGradient>
          {/* Holographic dollar globe */}
          <radialGradient id="holoGlobe" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#14C1FF" stopOpacity="0.4" />
            <stop offset="60%" stopColor="#0F52BA" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#0A1A3F" stopOpacity="0" />
          </radialGradient>
          {/* Card gradient */}
          <linearGradient id="cardGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0F52BA" />
            <stop offset="100%" stopColor="#0A1A3F" />
          </linearGradient>
          {/* Tablet screen */}
          <linearGradient id="tabletScreen" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0A1A3F" />
            <stop offset="100%" stopColor="#0F52BA" />
          </linearGradient>
          {/* Bank building gradient */}
          <linearGradient id="bankGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b0c4de" />
            <stop offset="100%" stopColor="#6a8caf" />
          </linearGradient>
          <filter id="robotShadow">
            <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#0A1A3F" floodOpacity="0.3" />
          </filter>
          <filter id="neonGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ============ BANK BUILDING (top-left) ============ */}
        <g transform="translate(50, 100)" opacity="0.85">
          {/* Building base */}
          <rect x="0" y="30" width="80" height="60" rx="3" fill="url(#bankGrad)" />
          {/* Roof / pediment */}
          <polygon points="40,5 -5,30 85,30" fill="url(#bankGrad)" stroke="#8aa8c8" strokeWidth="1" />
          {/* Dollar sign on pediment */}
          <text x="40" y="25" textAnchor="middle" fill="#FFD700" fontSize="14" fontWeight="bold" fontFamily="serif">$</text>
          {/* Columns */}
          <rect x="12" y="35" width="8" height="50" rx="2" fill="#c8d8e8" />
          <rect x="32" y="35" width="8" height="50" rx="2" fill="#c8d8e8" />
          <rect x="52" y="35" width="8" height="50" rx="2" fill="#c8d8e8" />
          {/* Door */}
          <rect x="30" y="65" width="20" height="25" rx="3" fill="#0A1A3F" />
          {/* Window glow */}
          <rect x="32" y="68" width="16" height="8" rx="1" fill="#FFD700" opacity="0.6">
            <animate attributeName="opacity" values="0.4;0.8;0.4" dur="3s" repeatCount="indefinite" />
          </rect>
        </g>

        {/* ============ CREDIT CARD (top-right) ============ */}
        <g transform="translate(355, 105)" style={{ animation: "card-shimmer 4s ease-in-out infinite" }}>
          <rect x="0" y="0" width="100" height="62" rx="8" fill="url(#cardGrad)" stroke="#14C1FF" strokeWidth="1" opacity="0.9" />
          {/* Chip */}
          <rect x="15" y="18" width="18" height="14" rx="3" fill="#FFD700" opacity="0.7" />
          {/* Card number placeholder */}
          <text x="12" y="48" fill="#14C1FF" fontSize="6" fontFamily="monospace" opacity="0.7">XXXX  XXXX  XXXX  XXXX</text>
          {/* Contactless icon */}
          <g transform="translate(78, 14)">
            <path d="M0,8 Q4,4 4,0" fill="none" stroke="#14C1FF" strokeWidth="1" opacity="0.5" />
            <path d="M0,12 Q8,6 8,0" fill="none" stroke="#14C1FF" strokeWidth="1" opacity="0.4" />
            <path d="M0,16 Q12,8 12,0" fill="none" stroke="#14C1FF" strokeWidth="1" opacity="0.3" />
          </g>
          {/* Mastercard-like circles */}
          <circle cx="78" cy="48" r="7" fill="#FF5722" opacity="0.6" />
          <circle cx="88" cy="48" r="7" fill="#FFD700" opacity="0.5" />
        </g>

        {/* ============ ROBOT CHARACTER ============ */}
        <g filter="url(#robotShadow)">

          {/* ---- Banker Cap ---- */}
          <g transform="translate(250, 185)">
            {/* Cap brim */}
            <ellipse cx="0" cy="12" rx="58" ry="10" fill="#1a2535" />
            {/* Cap body */}
            <path d="M-45,12 Q-48,-10 -30,-25 Q0,-38 30,-25 Q48,-10 45,12 Z" fill="url(#robotDark)" />
            {/* Gold band */}
            <path d="M-46,5 Q0,-8 46,5" fill="none" stroke="#FFD700" strokeWidth="2.5" />
            {/* Gold badge */}
            <circle cx="0" cy="-12" r="8" fill="#FFD700">
              <animate attributeName="fill" values="#FFD700;#FFA500;#FFD700" dur="3s" repeatCount="indefinite" />
            </circle>
            <text x="0" y="-8" textAnchor="middle" fill="#1a2535" fontSize="10" fontWeight="bold" fontFamily="serif">$</text>
          </g>

          {/* ---- Head ---- */}
          <ellipse cx="250" cy="230" rx="52" ry="45" fill="url(#robotBody)" />
          {/* Face plate (dark visor) */}
          <ellipse cx="250" cy="235" rx="42" ry="32" fill="url(#robotDark)" />

          {/* ---- Eyes (glowing cyan) ---- */}
          <g style={{ animation: "eye-glow 3s ease-in-out infinite" }}>
            {/* Left eye */}
            <ellipse cx="232" cy="232" rx="12" ry="13" fill="url(#eyeBlueGlow)">
              <animate attributeName="ry" values="13;11;13" dur="4s" repeatCount="indefinite" />
            </ellipse>
            <ellipse cx="232" cy="232" rx="6" ry="7" fill="#14C1FF" />
            <ellipse cx="230" cy="229" rx="3" ry="3" fill="#ffffff" opacity="0.8" />
            {/* Right eye */}
            <ellipse cx="268" cy="232" rx="12" ry="13" fill="url(#eyeBlueGlow)">
              <animate attributeName="ry" values="13;11;13" dur="4s" repeatCount="indefinite" />
            </ellipse>
            <ellipse cx="268" cy="232" rx="6" ry="7" fill="#14C1FF" />
            <ellipse cx="266" cy="229" rx="3" ry="3" fill="#ffffff" opacity="0.8" />
          </g>

          {/* ---- Smile ---- */}
          <path d="M238,252 Q250,265 262,252" fill="#1a2535" stroke="#14C1FF" strokeWidth="0.5" opacity="0.8" />

          {/* ---- Ear headphones ---- */}
          <ellipse cx="198" cy="235" rx="10" ry="14" fill="#c8d4e0" stroke="#aab8c8" strokeWidth="1" />
          <ellipse cx="302" cy="235" rx="10" ry="14" fill="#c8d4e0" stroke="#aab8c8" strokeWidth="1" />

          {/* ---- Neck ---- */}
          <rect x="238" y="272" width="24" height="12" rx="4" fill="#c8d4e0" />

          {/* ---- Body / torso ---- */}
          <path d="M210,284 Q208,290 206,340 Q205,360 218,370 L282,370 Q295,360 294,340 Q292,290 290,284 Z"
            fill="url(#robotBody)" stroke="#b8c8d8" strokeWidth="1" />

          {/* Tie */}
          <polygon points="246,290 254,290 256,310 250,318 244,310" fill="#1a2535" />

          {/* Badge on chest */}
          <rect x="262" y="295" width="14" height="10" rx="2" fill="#FFD700" opacity="0.7" />
          <text x="269" y="303" textAnchor="middle" fill="#1a2535" fontSize="7" fontWeight="bold">ID</text>

          {/* Chest light / arc reactor */}
          <circle cx="250" cy="330" r="10" fill="#0A1A3F" stroke="#14C1FF" strokeWidth="1.5">
            <animate attributeName="stroke" values="#14C1FF;#00FFA3;#14C1FF" dur="3s" repeatCount="indefinite" />
          </circle>
          <circle cx="250" cy="330" r="5" fill="#14C1FF" opacity="0.8">
            <animate attributeName="r" values="4;6;4" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" />
          </circle>

          {/* Belt */}
          <rect x="208" y="350" width="84" height="8" rx="3" fill="#1a2535" />
          <rect x="244" y="348" width="12" height="12" rx="2" fill="#c8d4e0" stroke="#aab8c8" strokeWidth="0.5" />

          {/* ---- Left arm (holding gold coin) ---- */}
          <path d="M210,295 Q185,310 170,335 Q160,355 155,365"
            fill="none" stroke="url(#robotBody)" strokeWidth="18" strokeLinecap="round" />
          {/* Left hand */}
          <circle cx="155" cy="368" r="12" fill="url(#robotBody)" stroke="#b8c8d8" strokeWidth="1" />

          {/* Gold coin in left hand */}
          <g transform="translate(145, 340)" style={{ animation: "coin-float 3s ease-in-out infinite" }}>
            <ellipse cx="0" cy="0" rx="20" ry="22" fill="url(#goldGrad)" stroke="#DAA520" strokeWidth="1.5" />
            <text x="0" y="6" textAnchor="middle" fill="#8B6914" fontSize="18" fontWeight="bold" fontFamily="serif">$</text>
            {/* Coin shine */}
            <ellipse cx="-6" cy="-8" rx="5" ry="8" fill="white" opacity="0.3" transform="rotate(-15)" />
            {/* Coin glow */}
            <ellipse cx="0" cy="0" rx="24" ry="26" fill="none" stroke="#FFD700" strokeWidth="1" opacity="0.4">
              <animate attributeName="opacity" values="0.2;0.6;0.2" dur="2s" repeatCount="indefinite" />
            </ellipse>
          </g>

          {/* ---- Right arm (holding tablet) ---- */}
          <path d="M290,295 Q315,310 330,335 Q340,355 345,365"
            fill="none" stroke="url(#robotBody)" strokeWidth="18" strokeLinecap="round" />
          {/* Right hand */}
          <circle cx="345" cy="368" r="12" fill="url(#robotBody)" stroke="#b8c8d8" strokeWidth="1" />

          {/* Analytics tablet in right hand */}
          <g transform="translate(330, 305)" style={{ animation: "tablet-glow 3s ease-in-out infinite" }}>
            <rect x="0" y="0" width="65" height="50" rx="6" fill="url(#tabletScreen)" stroke="#14C1FF" strokeWidth="1.5" />
            {/* Screen content - bar chart */}
            <rect x="8" y="28" width="8" height="16" rx="1" fill="#14C1FF" opacity="0.7" />
            <rect x="20" y="20" width="8" height="24" rx="1" fill="#00FFA3" opacity="0.7" />
            <rect x="32" y="14" width="8" height="30" rx="1" fill="#14C1FF" opacity="0.7" />
            <rect x="44" y="8" width="8" height="36" rx="1" fill="#00FFA3" opacity="0.7" />
            {/* Pie chart icon */}
            <circle cx="45" cy="14" r="0" fill="none" />
            {/* Screen glow line */}
            <line x1="6" y1="46" x2="59" y2="46" stroke="#14C1FF" strokeWidth="0.5" opacity="0.5" />
          </g>

          {/* ---- Legs ---- */}
          <rect x="222" y="370" width="22" height="35" rx="8" fill="url(#robotBody)" stroke="#b8c8d8" strokeWidth="0.5" />
          <rect x="256" y="370" width="22" height="35" rx="8" fill="url(#robotBody)" stroke="#b8c8d8" strokeWidth="0.5" />

          {/* Feet */}
          <ellipse cx="233" cy="408" rx="16" ry="8" fill="#1a2535" />
          <ellipse cx="267" cy="408" rx="16" ry="8" fill="#1a2535" />
        </g>

        {/* ============ COIN STACKS (bottom-left) ============ */}
        <g transform="translate(85, 410)" style={{ animation: "stack-gleam 4s ease-in-out infinite" }}>
          {/* Stack 1 */}
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={`s1-${i}`}>
              <ellipse cx="0" cy={-i * 8} rx="18" ry="5" fill="url(#goldGrad)" stroke="#DAA520" strokeWidth="0.5" />
            </g>
          ))}
          {/* Stack 2 */}
          {[0, 1, 2, 3].map((i) => (
            <g key={`s2-${i}`}>
              <ellipse cx="30" cy={8 - i * 8} rx="18" ry="5" fill="url(#goldGrad)" stroke="#DAA520" strokeWidth="0.5" />
            </g>
          ))}
          {/* Stack 3 */}
          {[0, 1, 2].map((i) => (
            <g key={`s3-${i}`}>
              <ellipse cx="55" cy={16 - i * 8} rx="16" ry="5" fill="url(#goldGrad)" stroke="#DAA520" strokeWidth="0.5" />
            </g>
          ))}
        </g>

        {/* ============ HOLOGRAPHIC DOLLAR GLOBE (bottom-right) ============ */}
        <g transform="translate(400, 440)">
          {/* Base platform */}
          <ellipse cx="0" cy="30" rx="30" ry="8" fill="#0F52BA" opacity="0.5" />
          <rect x="-25" y="20" width="50" height="10" rx="3" fill="#14C1FF" opacity="0.2" />

          {/* Globe */}
          <circle cx="0" cy="0" r="28" fill="url(#holoGlobe)" stroke="#14C1FF" strokeWidth="1" opacity="0.8">
            <animate attributeName="r" values="27;29;27" dur="3s" repeatCount="indefinite" />
          </circle>

          {/* Rotating ring around globe */}
          <ellipse cx="0" cy="0" rx="32" ry="12" fill="none" stroke="#14C1FF" strokeWidth="0.8" opacity="0.5"
            strokeDasharray="4 3"
            style={{ animation: "holo-spin 8s linear infinite", transformOrigin: "0px 0px" } as React.CSSProperties} />

          {/* Dollar sign inside */}
          <text x="0" y="8" textAnchor="middle" fill="#FFD700" fontSize="28" fontWeight="bold" fontFamily="serif" opacity="0.8">
            <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" />
            $
          </text>

          {/* Horizontal grid lines on globe */}
          <ellipse cx="0" cy="-10" rx="22" ry="4" fill="none" stroke="#14C1FF" strokeWidth="0.4" opacity="0.3" />
          <ellipse cx="0" cy="0" rx="28" ry="5" fill="none" stroke="#14C1FF" strokeWidth="0.4" opacity="0.3" />
          <ellipse cx="0" cy="10" rx="22" ry="4" fill="none" stroke="#14C1FF" strokeWidth="0.4" opacity="0.3" />

          {/* Globe glow */}
          <circle cx="0" cy="0" r="35" fill="none" stroke="#14C1FF" strokeWidth="1" opacity="0.2" filter="url(#neonGlow)">
            <animate attributeName="opacity" values="0.1;0.3;0.1" dur="3s" repeatCount="indefinite" />
          </circle>
        </g>
      </svg>
    </div>
  );
}
