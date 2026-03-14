# ASCII Globe

A React component that renders an interactive, spinning ASCII-art globe on an HTML5 canvas.

![ASCII Globe](https://raw.githubusercontent.com/happyrobot-ai/design-assets/main/ascii-globe/preview.png)

## Features

- Equirectangular world map texture encoded as ASCII strings (no external assets)
- Lambertian shading with a smoothstep twilight terminator
- Atmospheric limb glow via radial gradient
- Drag to spin with flick momentum — mouse and touch
- Auto-rotates and eases back to base speed after a flick
- Configurable `size` prop; scales font and geometry automatically
- DPI-aware (`devicePixelRatio`)

## Usage

Drop `AsciiGlobe.tsx` into your project. It requires React 18+ and has no other dependencies.

```tsx
import AsciiGlobe from "./AsciiGlobe";

// Default size (520px)
<AsciiGlobe />

// Custom size
<AsciiGlobe size={360} />

// With Tailwind / extra class
<AsciiGlobe size={480} className="mx-auto" />
```

The component is marked `"use client"` for Next.js App Router. In plain React / Vite you can remove that directive.

## Props

| Prop        | Type     | Default | Description                        |
|-------------|----------|---------|------------------------------------|
| `size`      | `number` | `520`   | Width and height of the canvas (px)|
| `className` | `string` | `""`    | Extra CSS classes on the wrapper   |

## Customization

A few constants at the top of the file are easy to tweak:

| Constant        | Default | Effect                                              |
|-----------------|---------|-----------------------------------------------------|
| `INVERT_SHADING`| `false` | Flip lit/dark — makes the shadow the dense side     |
| `BASE_SPEED`    | `0.11`  | Auto-rotation speed (rad/s)                         |
| `DAMPING`       | `2.2`   | How quickly flick momentum decays to `BASE_SPEED`   |
| `COLOR_STOPS`   | —       | Gradient from deep night purple to pale day lavender|

To change the color palette edit `COLOR_STOPS`. Each entry is `[brightnessThreshold, hexColor]`.

## How it works

Each frame, the renderer walks a grid of character cells that fits inside the canvas. For every cell whose center falls inside the unit circle it:

1. Unprojects the 2-D screen position onto the 3-D sphere surface
2. Applies a Y-axis rotation (`angleRef`) to get world-space coordinates
3. Converts to latitude/longitude and looks up the land/ocean map
4. Computes a Lambertian dot product against a fixed view-space sun direction
5. Smoothsteps across the terminator and maps brightness to a character and color

The sun direction stays fixed in screen space so the lit hemisphere never rotates — only the land texture spins underneath.

## Requirements

- React 18+
- A monospace font loaded in the page (falls back to `"Courier New"` — looks best with `"IBM Plex Mono"`)
- Next.js App Router: keep the `"use client"` directive
- Vite / CRA / other: remove `"use client"`
