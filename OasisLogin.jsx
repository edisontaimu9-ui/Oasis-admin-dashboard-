import { useState, useEffect, useRef } from "react";

// ─── DESIGN TOKENS (matches Oasis clinical palette) ───────────────────────
const T = {
  bg:          "#040d1c",
  surface:     "#071526",
  surface2:    "#0b1f3a",
  border2:     "rgba(255,255,255,0.10)",
  border:      "rgba(255,255,255,0.06)",
  teal:        "#1de9d4",
  tealGlow:    "rgba(29,233,212,0.35)",
  amber:       "#f0b429",
  amberDim:    "rgba(240,180,41,0.08)",
  amberBorder: "rgba(240,180,41,0.18)",
  red:         "#f43f5e",
  text:        "#e2e8f0",
  muted:       "rgba(226,232,240,0.45)",
  mono:        "'JetBrains Mono', 'Fira Mono', monospace",
  display:     "'Syne', 'Outfit', sans-serif",
};

// ─── SIMULATED ADMIN PASSWORD ─────────────────────────────────────────────
const ADMIN_PASS = "oasis2024";

// ─── KEYFRAMES ────────────────────────────────────────────────────────────
const KEYFRAMES = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
  @keyframes spinCW  { to { transform: rotate(360deg);  } }
  @keyframes spinCCW { to { transform: rotate(-360deg); } }
  @keyframes fadeUp  {
    from { opacity: 0; transform: translateY(18px); }
    to   { opacity: 1; transform: translateY(0);    }
  }
  @keyframes pulseBorder {
    0%,100% { box-shadow: 0 0 0 0 rgba(29,233,212,0); }
    50%     { box-shadow: 0 0 0 6px rgba(29,233,212,0.10); }
  }
  @keyframes shakeX {
    0%,100% { transform: translateX(0); }
    20%     { transform: translateX(-8px); }
    40%     { transform: translateX(8px); }
    60%     { transform: translateX(-5px); }
    80%     { transform: translateX(5px); }
  }
  @keyframes scanline {
    0%   { transform: translateY(-100%); }
    100% { transform: translateY(100vh); }
  }
  @keyframes blink { 50% { opacity: 0; } }
  @keyframes successPulse {
    0%   { box-shadow: 0 40px 100px rgba(0,0,0,0.7), 0 0 0 0 rgba(29,233,212,0.5); }
    70%  { box-shadow: 0 40px 100px rgba(0,0,0,0.7), 0 0 0 18px rgba(29,233,212,0); }
    100% { box-shadow: 0 40px 100px rgba(0,0,0,0.7), 0 0 0 0 rgba(29,233,212,0);   }
  }
`;

export default function OasisLogin() {
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [shake,    setShake]    = useState(false);
  const [success,  setSuccess]  = useState(false);
  const [focused,  setFocused]  = useState(false);
  const [mounted,  setMounted]  = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = KEYFRAMES;
    document.head.appendChild(style);
    setTimeout(() => setMounted(true), 60);
    inputRef.current?.focus();
    return () => document.head.removeChild(style);
  }, []);

  function handleInput(val) {
    setPassword(val);
    setError("");
    if (val === ADMIN_PASS) {
      setSuccess(true);
      return;
    }
    if (val.length >= ADMIN_PASS.length) {
      setError("Incorrect password. Access denied.");
      setShake(true);
      setTimeout(() => { setShake(false); setPassword(""); }, 480);
    }
  }

  const filled = Math.min(password.length, ADMIN_PASS.length);

  // ── Styles ───────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: T.bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: T.display, overflow: "hidden",
    }}>
      {/* Atmosphere */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: `
          radial-gradient(ellipse 55% 45% at 15% 15%, rgba(29,233,212,0.055) 0%, transparent 70%),
          radial-gradient(ellipse 45% 55% at 85% 85%, rgba(240,180,41,0.04) 0%, transparent 70%),
          radial-gradient(ellipse 30% 30% at 50% 50%, rgba(59,130,246,0.03) 0%, transparent 60%)
        `,
      }} />

      {/* Grid */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: `
          linear-gradient(rgba(29,233,212,0.025) 1px, transparent 1px),
          linear-gradient(90deg, rgba(29,233,212,0.025) 1px, transparent 1px)
        `,
        backgroundSize: "40px 40px",
      }} />

      {/* Scanline */}
      <div style={{
        position: "absolute", left: 0, right: 0, height: 2,
        background: "linear-gradient(transparent, rgba(29,233,212,0.05), transparent)",
        animation: "scanline 6s linear infinite",
        pointerEvents: "none",
      }} />

      {/* ── CARD ─────────────────────────────────────────────────────────── */}
      <div style={{
        position: "relative", width: 380,
        background: T.surface,
        border: `1px solid ${T.border2}`,
        borderRadius: 20, padding: "40px 36px 36px",
        boxShadow: "0 40px 100px rgba(0,0,0,0.7), 0 0 0 1px rgba(29,233,212,0.06)",
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translateY(0)" : "translateY(24px)",
        transition: "opacity 0.5s ease, transform 0.5s ease",
        animation: shake ? "shakeX 0.45s ease" : success ? "successPulse 0.6s ease" : undefined,
      }}>

        {/* ── Logo row ─────────────────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 14, marginBottom: 28,
          animation: mounted ? "fadeUp 0.5s ease 0.1s both" : undefined,
        }}>
          {/* Spinning rings */}
          <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0 }}>
            <div style={{
              position: "absolute", inset: 0, borderRadius: "50%",
              border: "2px solid transparent",
              borderTopColor: T.teal, borderLeftColor: "rgba(29,233,212,0.25)",
              animation: "spinCW 2s linear infinite",
              filter: "drop-shadow(0 0 5px rgba(29,233,212,0.45))",
            }} />
            <div style={{
              position: "absolute", inset: 7, borderRadius: "50%",
              border: "1.5px solid transparent",
              borderBottomColor: "#3b82f6", borderRightColor: "rgba(59,130,246,0.25)",
              animation: "spinCCW 2.8s linear infinite",
            }} />
            <div style={{
              position: "absolute", inset: 14, borderRadius: "50%",
              background: "radial-gradient(circle, #0b1f3a 0%, #040d1c 100%)",
              border: "1px solid rgba(29,233,212,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontWeight: 800, color: T.teal,
            }}>O</div>
          </div>

          <div>
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.3px", color: T.text }}>
              Oasis
            </div>
            <div style={{
              fontFamily: T.mono, fontSize: 8, letterSpacing: "2.5px",
              color: T.muted, textTransform: "uppercase", marginTop: 4,
            }}>
              Clinical Nutrition Support Tool
            </div>
          </div>
        </div>

        {/* ── Badge ────────────────────────────────────────────────────── */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          fontFamily: T.mono, fontSize: 8, letterSpacing: "2px",
          color: T.amber, textTransform: "uppercase",
          background: T.amberDim, border: `1px solid ${T.amberBorder}`,
          borderRadius: 5, padding: "4px 10px", marginBottom: 26,
          animation: mounted ? "fadeUp 0.5s ease 0.18s both" : undefined,
        }}>
          <div style={{
            width: 5, height: 5, borderRadius: "50%",
            background: T.amber, animation: "blink 1.4s ease infinite",
          }} />
          Restricted Access
        </div>

        {/* Divider */}
        <div style={{
          height: 1,
          background: `linear-gradient(90deg, transparent, ${T.border2}, transparent)`,
          marginBottom: 24,
          animation: mounted ? "fadeUp 0.5s ease 0.22s both" : undefined,
        }} />

        {/* ── Password field ────────────────────────────────────────────── */}
        <div style={{
          marginBottom: 6,
          animation: mounted ? "fadeUp 0.5s ease 0.28s both" : undefined,
        }}>
          <label htmlFor="oasis-pass" style={{
            fontFamily: T.mono, fontSize: 9, letterSpacing: "2px",
            color: T.muted, textTransform: "uppercase",
            display: "block", marginBottom: 8,
          }}>
            Admin Password
          </label>
          <div style={{ position: "relative" }}>
            <input
              id="oasis-pass"
              ref={inputRef}
              type="password"
              placeholder="Enter admin password…"
              autoComplete="current-password"
              value={password}
              disabled={success}
              onChange={e => handleInput(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              style={{
                width: "100%", padding: "11px 42px 11px 14px",
                background: T.surface2,
                border: `1px solid ${focused ? T.tealGlow : error ? "rgba(244,63,94,0.4)" : T.border2}`,
                borderRadius: 10, color: T.text,
                fontFamily: T.mono, fontSize: 13,
                outline: "none", boxSizing: "border-box",
                transition: "border-color 0.2s, box-shadow 0.2s",
                boxShadow: focused ? "0 0 0 3px rgba(29,233,212,0.08)" : "none",
                animation: focused && !error ? "pulseBorder 2.2s ease infinite" : undefined,
              }}
            />
            {/* Lock / check icon */}
            <span style={{
              position: "absolute", right: 13, top: "50%",
              transform: "translateY(-50%)",
              fontSize: 13, pointerEvents: "none",
              color: success ? T.teal : focused ? T.teal : T.muted,
              opacity: success ? 1 : 0.5,
              transition: "color 0.2s",
            }}>
              {success ? "✓" : "🔒"}
            </span>
          </div>
        </div>

        {/* ── Status + dot progress ─────────────────────────────────────── */}
        <div style={{
          minHeight: 20, marginTop: 10,
          display: "flex", alignItems: "center", gap: 6,
          animation: mounted ? "fadeUp 0.5s ease 0.33s both" : undefined,
        }}>
          {/* Status text */}
          {error && !success && (
            <span style={{ fontFamily: T.mono, fontSize: 10, color: T.red }}>
              ⚠ {error}
            </span>
          )}
          {success && (
            <span style={{ fontFamily: T.mono, fontSize: 10, color: T.teal }}>
              ✓ Access granted — loading dashboard…
            </span>
          )}
          {!error && !success && password.length === 0 && (
            <span style={{ fontFamily: T.mono, fontSize: 10, color: T.muted }}>
              Type password to authenticate instantly
            </span>
          )}
          {!error && !success && password.length > 0 && (
            <span style={{ fontFamily: T.mono, fontSize: 10, color: T.muted }}>
              Verifying…
            </span>
          )}

          {/* Dot progress — right-aligned */}
          <div style={{ display: "flex", gap: 3, marginLeft: "auto" }}>
            {Array.from({ length: ADMIN_PASS.length }).map((_, i) => (
              <div key={i} style={{
                width: 5, height: 5, borderRadius: "50%",
                background: i < filled
                  ? (success ? T.teal : error ? T.red : T.tealGlow)
                  : T.border2,
                transition: "background 0.12s",
              }} />
            ))}
          </div>
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div style={{
          marginTop: 28, paddingTop: 18,
          borderTop: `1px solid ${T.border}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          animation: mounted ? "fadeUp 0.5s ease 0.38s both" : undefined,
        }}>
          <div style={{
            fontFamily: T.mono, fontSize: 8, letterSpacing: "1.5px",
            color: T.muted, textTransform: "uppercase",
          }}>
            Oasis Admin Dashboard
          </div>
          <div style={{ fontFamily: T.mono, fontSize: 8, color: "rgba(29,233,212,0.35)" }}>
            v2.0.0
          </div>
        </div>

      </div>{/* end card */}
    </div>
  );
}
