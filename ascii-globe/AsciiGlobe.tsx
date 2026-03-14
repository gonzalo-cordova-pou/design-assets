"use client";

import { useEffect, useRef } from "react";

// ASCII density chars — light → dark
const BINARY_CHARS = [" ", ".", ":", "-", "=", "+", "*", "#", "%", "@"] as const;

// Toggle shading mode:
//   false → lit side = dense dark chars, shadow fades (natural, globe reads as illuminated form)
//   true  → shadow side = dense dark chars, lit side fades (inverted, shadow is the presence)
const INVERT_SHADING = false;

// Base auto-rotation speed in radians/second
const BASE_SPEED = 0.11;
// How fast momentum decays back toward base speed (higher = snappier)
const DAMPING = 2.2;

// World map texture extracted from earth.txt (equirectangular projection)
// '.' = ocean, '+' = land  — 34 rows × ~140 columns
const EARTH_ROWS = [
  "............................................................................................................................................",
  "............................................................................................................................................",
  "..................................+++++++..+++++++++++++++++++...............................................................................",
  "......................+.+++++..+.+.+++++........++++++++++++++.............................+..........++++++++++++++..+.....++...............",
  "......++++++++++++++++++++++++++++++++..++++.....++++++++++.................++++++++.....+++++++++++++++++++++++++++++++++++++++++++++++++++",
  "......+++++++++++++++++++++++++++++.....++++......++++...................++++.+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++.",
  "........++.......+++++++++++++++++......++++++......................+....++++..++++++++++++++++++++++++++++++++++++++++++++++......+...",
  "....................++++++++++++++++++.+++++++++....................++..+++++++++++++++++++++++++++++++++++++++++++++++++++++++.......+.......",
  "......................+++++++++++++++++++++++........................+++++++++++++++++++++++++++++++++++++++++++++++++++++++.................",
  "......................+++++++++++++++++++++........................++++...+.+++++....++++.+++++++++++++++++++++++++++++++...................",
  "......................+++++++++++++++++++..........................+++........+..++++++++..+++++++++++++++++++++++++...+....+...............",
  ".........................++++++++++++++............................+++++++++..+....++++++++++++++++++++++++++++++++++.......................",
  "..........................++++++......+..........................++++++++++++++++++++++++++++++++++++++++++++++++++++.......................",
  ".............................+++................................++++++++++++++++++++.++++++++....+++++++++++++++++..........................",
  "...............................++.++............................+++++++++++++++++++++.+++++.......++++.....+++++............................",
  "....................................++..........................+++++++++++++++++++++++++..........++.......+.++............................",
  "........................................+++++++..................++++++++++++++++++++++++...................................................",
  ".......................................+++++++++++........................++++++++++++++.....................+...+++........................",
  ".......................................++++++++++++++++...................++++++++++++.......................++..++........++...............",
  ".......................................+++++++++++++++++...................++++++++++.......................................++..............",
  "........................................+++++++++++++++....................+++++++++++..................................+++..+..............",
  "..........................................+++++++++++++....................+++++++++...++............................++++++++++.............",
  "...........................................+++++++++........................++++++++...+..........................+++++++++++++++...........",
  "..........................................+++++++++.........................++++++................................+++++++++++++++...........",
  "..........................................+++++++............................+++...................................+++....+++++++...........",
  "..........................................++++................................................................................+.............",
  ".........................................++++...............................................................................................",
  ".........................................+++................................................................................................",
  "............................................................................................................................................",
  "............................................................................................................................................",
  "............................................................................................................................................",
  "............................................++.....................................+.++++++++++++..+++++++++++++++++++++++++++++++++........",
  "....................+++++++...++++++++++++++++.................+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++......",
  "..........+++++++++++++++++++++++++++++++..........+....+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++.......",
].map(r => r.padEnd(140));

const TEX_H = EARTH_ROWS.length;
const TEX_W = EARTH_ROWS[0].length;

function isLand(latDeg: number, lonDeg: number): boolean {
  const texX = Math.floor(((lonDeg + 180) / 360) * TEX_W);
  const texY = Math.floor(((90 - latDeg) / 180) * TEX_H);
  const row = EARTH_ROWS[Math.max(0, Math.min(TEX_H - 1, texY))];
  const char = row?.[Math.max(0, Math.min(TEX_W - 1, texX))];
  return char === "+";
}

// 12-stop color scale — deep night → bright day
// Extra dark stops cover the night hemisphere
// Shadow = darkest, terminator = mid, lit = fades to background
// Capped at #aba9c4 so even sparse lit-side chars stay visible on white
const COLOR_STOPS: [number, string][] = [
  [0.00, "#3b3975"],
  [0.24, "#4b4b83"],
  [0.34, "#4e4d92"],
  [0.44, "#5d5b9e"],
  [0.54, "#635fa7"],
  [0.64, "#8481c5"],
  [0.78, "#aba9c4"],
];

function brightnessColor(b: number): string {
  for (let i = COLOR_STOPS.length - 1; i >= 0; i--) {
    if (b >= COLOR_STOPS[i][0]) return COLOR_STOPS[i][1];
  }
  return COLOR_STOPS[0][1];
}

interface AsciiGlobeProps {
  size?: number;
  className?: string;
}

export default function AsciiGlobe({ size = 520, className = "" }: AsciiGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const angleRef = useRef(1.8);
  const lastTimeRef = useRef(0);

  // Interaction state
  const velocityRef = useRef(BASE_SPEED);   // rad/s — drives rotation each frame
  const isDraggingRef = useRef(false);
  const lastMouseXRef = useRef(0);
  const lastMouseTimeRef = useRef(0);
  // Ring buffer of recent (dx, dt) samples for flick velocity
  const recentRef = useRef<{ dx: number; dt: number }[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    // Pixels that correspond to one radian of rotation
    const pixelsPerRad = (size / 2) * 0.91;

    // ── Event handlers ──────────────────────────────────────

    function startDrag(clientX: number) {
      isDraggingRef.current = true;
      lastMouseXRef.current = clientX;
      lastMouseTimeRef.current = performance.now();
      recentRef.current = [];
      container!.style.cursor = "grabbing";
    }

    function moveDrag(clientX: number) {
      if (!isDraggingRef.current) return;
      const now = performance.now();
      const dx = clientX - lastMouseXRef.current;
      const dt = Math.max((now - lastMouseTimeRef.current) / 1000, 0.001);

      // Rotate directly
      angleRef.current -= dx / pixelsPerRad;

      // Keep a small ring buffer for flick detection (last ~120ms)
      recentRef.current.push({ dx, dt });
      if (recentRef.current.length > 6) recentRef.current.shift();

      lastMouseXRef.current = clientX;
      lastMouseTimeRef.current = now;
    }

    function endDrag() {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      container!.style.cursor = "grab";

      // Compute flick velocity from recent samples
      const samples = recentRef.current;
      if (samples.length > 0) {
        const totalDx = samples.reduce((s, d) => s + d.dx, 0);
        const totalDt = samples.reduce((s, d) => s + d.dt, 0);
        if (totalDt > 0) {
          velocityRef.current = -(totalDx / pixelsPerRad) / totalDt;
        }
      }
      recentRef.current = [];
    }

    // Mouse
    const onMouseDown = (e: MouseEvent) => startDrag(e.clientX);
    const onMouseMove = (e: MouseEvent) => moveDrag(e.clientX);
    const onMouseUp = () => endDrag();

    // Touch
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      startDrag(e.touches[0].clientX);
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      moveDrag(e.touches[0].clientX);
    };
    const onTouchEnd = () => endDrag();

    container.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    container.addEventListener("touchstart", onTouchStart, { passive: false });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd);

    // ── Render loop ──────────────────────────────────────────

    const frame = (timestamp: number) => {
      const delta = lastTimeRef.current
        ? Math.min((timestamp - lastTimeRef.current) / 1000, 0.05)
        : 0;
      lastTimeRef.current = timestamp;

      if (!isDraggingRef.current) {
        // Ease velocity back toward base auto-rotation speed
        velocityRef.current += (BASE_SPEED - velocityRef.current) * Math.min(1, DAMPING * delta);
        angleRef.current += velocityRef.current * delta;
      }

      ctx.clearRect(0, 0, size, size);

      const fontSize = Math.max(9, Math.floor(size / 42));
      ctx.font = `${fontSize}px "IBM Plex Mono", "Courier New", monospace`;
      ctx.textBaseline = "top";

      const charW = ctx.measureText("M").width;
      const charH = fontSize * 1.2;
      const cols = Math.ceil(size / charW);
      const rows = Math.ceil(size / charH);

      const radiusPx = pixelsPerRad;
      const cx = size / 2;
      const cy = size / 2;

      // Sun direction in VIEW space — fixed on screen, not in world space.
      // Increasing lz pushes the terminator further right (more lit area).
      const lx = -0.58, ly = -0.38, lz = 0.72;
      const lLen = Math.sqrt(lx * lx + ly * ly + lz * lz);
      const lnx = lx / lLen, lny = ly / lLen, lnz = lz / lLen;

      const angle = angleRef.current;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      for (let row = 0; row < rows; row++) {
        const py = row * charH + charH / 2;
        for (let col = 0; col < cols; col++) {
          const px = col * charW + charW / 2;

          const sx = (px - cx) / radiusPx;
          const sy = (py - cy) / radiusPx;
          const d2 = sx * sx + sy * sy;
          if (d2 > 1.0) continue;

          const sz = Math.sqrt(1.0 - d2);

          const x3d = sx * cosA + sz * sinA;
          const y3d = -sy;
          const z3d = -sx * sinA + sz * cosA;

          const latDeg = Math.asin(Math.max(-1, Math.min(1, y3d))) * (180 / Math.PI);
          const lonDeg = Math.atan2(x3d, z3d) * (180 / Math.PI);

          const land = isLand(latDeg, lonDeg);

          // Dot product against the VIEW-SPACE normal (sx, -sy, sz) — before rotation.
          // This keeps the lit/dark zones fixed on screen while the texture rotates underneath.
          const dot = sx * lnx + (-sy) * lny + sz * lnz;

          // Cubic smoothstep across ±0.13 twilight band at the terminator
          const TWIL = 0.13;
          const t = Math.max(0, Math.min(1, (dot + TWIL) / (2 * TWIL)));
          const smooth = t * t * (3 - 2 * t);

          // Day: Lambertian; night: near-zero ambient
          const dayB = 0.18 + Math.max(0, dot) * 0.82;
          const brightness = 0.04 + smooth * (dayB - 0.04);

          if (!land) {
            // Ocean shimmer on the lit side where the globe has presence
            if (brightness > 0.42 && d2 < 0.78) {
              ctx.fillStyle = "rgba(100,96,170,0.15)";
              ctx.fillText("·", col * charW, row * charH);
            }
            continue;
          }

          const shadingB = INVERT_SHADING ? 1 - brightness : brightness;
          const charIdx = Math.max(1, Math.min(BINARY_CHARS.length - 1, Math.floor(shadingB * BINARY_CHARS.length)));
          const char = BINARY_CHARS[charIdx];
          ctx.fillStyle = brightnessColor(INVERT_SHADING ? brightness : 1 - brightness);
          ctx.fillText(char, col * charW, row * charH);
        }
      }

      // Atmospheric limb glow
      const atmo = ctx.createRadialGradient(cx, cy, radiusPx * 0.87, cx, cy, radiusPx * 1.04);
      atmo.addColorStop(0, "rgba(78,72,158,0)");
      atmo.addColorStop(0.7, "rgba(78,72,158,0.04)");
      atmo.addColorStop(1, "rgba(172,174,201,0.09)");
      ctx.fillStyle = atmo;
      ctx.beginPath();
      ctx.arc(cx, cy, radiusPx * 1.04, 0, Math.PI * 2);
      ctx.fill();

      animRef.current = requestAnimationFrame(frame);
    };

    animRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(animRef.current);
      container.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
    };
  }, [size]);

  return (
    <div
      ref={containerRef}
      className={`ascii-globe ${className}`}
      style={{ cursor: "grab", userSelect: "none" }}
    >
      <canvas ref={canvasRef} aria-label="Rotating ASCII globe — drag to spin" />
    </div>
  );
}
