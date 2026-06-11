# Design

## Visual Identity
A modern, professional, and authoritative aesthetic utilizing a high-contrast palette. The design focuses on high-precision administrative workflows using Public Sans and Material Symbols.

## Color Palette

| Role | Hex | Usage |
| --- | --- | --- |
| **Primary (Brand)** | `#4D7CFE` | Primary actions, branding, key accents |
| **Primary Faint** | `rgba(77, 124, 254, 0.15)` | Chips, tags, background highlights |
| **Heading/Dark Text** | `#252631` | Main text and headings |
| **Success** | `#6DD230` | Active states, online dots, completed shifts |
| **Danger** | `#FE4D97` | Alerts, critical understaffing |
| **Secondary Grey** | `#778CA2` | Descriptions, secondary labels |
| **Background App** | `#F8FAFB` | Primary background |
| **Background Surface** | `#FFFFFF` | Cards and elevated containers |
| **Background Muted** | `#F2F4F6` | Hover states, sidebar background |
| **Border** | `#E8ECEF` | Dividers and input borders |

## Typography
System uses **Public Sans** for all textual content.

| Level | Size | Weight | Color |
| --- | --- | --- | --- |
| **H1** | 24px | 700 (Bold) | `#252631` |
| **H2** | 22px | 700 (Bold) | `#252631` |
| **H3** | 20px | 700 (Bold) | `#252631` or `#4D7CFE` |
| **H4** | 18px | 700 (Bold) | `#252631` or `#4D7CFE` |

## Iconography
Using **Material Symbols Outlined**.
- Default size: 20px.
- Sizing variants: 18px, 20px, 22px, 24px.
- Implementation: `<span className="material-symbols-outlined text-[size]">symbol_name</span>`.

## Components & Patterns

### Chips & Tags
- Background: 15% opacity of the semantic color (Primary, Success, or Danger).
- Text/Border: Full opacity of the semantic color.
- Radius: 4xl (fully rounded).

### Buttons
- Primary: `#4D7CFE` background, white text.
- Interaction: `scale(0.97)` on `:active`.

### Online/Status Dots
- Size: `w-1.5 h-1.5`.
- Active: `#6DD230` (Success Green).
- Error: `#FE4D97` (Danger Pink).
