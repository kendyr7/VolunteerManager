# Design

## Visual Identity
A clean, professional, and trustworthy aesthetic utilizing a high-contrast palette with sky-blue accents. The design prioritizes legibility and spatial organization to manage dense administrative data.

## Color Palette
Using OKLCH for precise color control (referencing Tailwind/CSS variables in `globals.css`).

| Role | Variable | Hex | OKLCH (Target) | Usage |
| --- | --- | --- | --- | --- |
| **Background** | `--dark` | `#fbfcfd` | `oklch(0.985 0 0)` | Primary app background |
| **Surface** | `--dark2` | `#ffffff` | `oklch(1 0 0)` | Cards, sidebar, elevated containers |
| **Muted Surface** | `--dark3` | `#f1f5f9` | `oklch(0.967 0.011 286.375)` | Hover states, secondary inputs |
| **Primary (Brand)** | `--gold` | `#0284c7` | `oklch(0.588 0.158 241.966)` | Primary actions, branding, key accents |
| **Accent Light** | `--gold-light` | `#38bdf8` | `oklch(0.77 0.17 241)` | Secondary accents, progress indicators |
| **Accent Faint** | `--gold-faint` | `#e0f2fe` | `oklch(0.94 0.04 241)` | Background tints, subtle highlights |
| **Ink (Text)** | `--text` | `#0f172a` | `oklch(0.145 0 0)` | Primary headings and body text |
| **Ink Dim** | `--text-dim` | `#334155` | `oklch(0.35 0 0)` | Secondary labels and descriptions |
| **Muted** | `--muted` | `#64748b` | `oklch(0.55 0 0)` | Placeholder text, disabled states |
| **Success** | `--accent` | `#10b981` | `oklch(0.69 0.19 154)` | Verified states, complete shifts |
| **Danger** | `--red` | `#ef4444` | `oklch(0.63 0.25 25)` | Critical alerts, empty shifts |

## Typography
System focuses on a balance between modern sans-serif for readability and monospace for data precision.

- **Headings & Body**: `Outfit` (sans-serif)
  - Letter-spacing: `-0.02em` to `-0.03em` for headers.
  - Weight: `800` (Mega/LG), `700` (MD/SM), `400` (Regular body).
- **Data & PINs**: `JetBrains Mono` (monospace)
  - Used for numbers, PIN inputs, and technical data points.

## Components & Patterns

### Cards
- **Premium Card**: `12px` radius, `1px` border (`--border`), subtle shadow.
- **Elevation**: On hover, shift shadow to `var(--shadow-md)` and border to `var(--border-strong)`.

### Buttons
- **Primary**: Sky blue background, `10px` radius, bold uppercase or bold title case.
- **Interaction**: `scale(0.97)` on `:active` for physical feedback (Emil Kowalski principle).

### Inputs
- **Base**: `12px` radius, `1px` border. On focus, transition border to `--gold` with a `4px` focus ring of `--gold-faint`.

## Motion & Transitions
- **Standard**: `160ms` to `250ms` using `cubic-bezier(0.23, 1, 0.32, 1)` (ease-out).
- **State Changes**: Use subtle blur (`2px`) or scale shifts to prevent jarring transitions.
- **Stagger**: List items (like volunteers or shifts) should enter with a `30-50ms` stagger delay.
