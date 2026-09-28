# 2ez design system

## Purpose

2ez is a calm command-center style for tools that help a person see and control a real system: a homelab, a personal library, a local workflow, or a compact operational product. It is not a dark cyberpunk theme, a glass dashboard, or a clone of Arc/Raycast.

The system’s job is to make the current state legible at a glance, then make the next useful action easy to find.

## Tested surface

The approved proof is a homelab overview: system health, service status, media activity, and downloads. It uses parallel system facts rather than inventing a linear process. Reference artifacts:

- [Desktop mockup](/tmp/business-mockup-2.html)
- [Mobile mockup](/tmp/business-mockup-2-mobile.html)

## Design thesis

Give the dense, always-on parts of a product a quiet place to live. A charcoal navigation rail holds orientation; an off-white work canvas gives data breathing room; tinted status appears only when it carries meaning. Operational metadata is compact and monospaced. Primary language is direct and human.

### Product-specific structure

The primary screen begins with the state people need to recognize in under three seconds. For the homelab, those are machine load, memory, disk capacity, and service health. These are parallel readings, not steps. The next section groups active entities by their domain: services, media, storage, or downloads.

## Tokens

### Color

| Token | Value | Role |
| --- | --- | --- |
| `--color-bg` | `#F5F5F3` | Main canvas |
| `--color-surface` | `#FFFFFF` | Panels and controls |
| `--color-ink` | `#202124` | Primary text and dark media panel |
| `--color-muted` | `#747779` | Supporting copy and metadata |
| `--color-border` | `#E5E5E1` | All panel and row separation |
| `--color-rail` | `#27292C` | Navigation rail |
| `--color-primary` | `#7952D8` | Navigation focus and restrained emphasis |
| `--color-live` | `#9ACA28` | Healthy / live state only |
| `--color-blue` | `#3986E8` | Network / transfer information |
| `--color-amber` | `#F2BD51` | Capacity / warning information |
| `--color-red` | `#EE746B` | Error / destructive states |

Avoid gradients on operational surfaces. The only exception is content artwork such as album art, never a generic hero wash.

### Type

- Display and body: `Manrope`, with tight display tracking (`-0.055em`) only on large Latin headings.
- Utility and live data: `DM Mono` for labels, units, time, command hints, statuses, and terse metadata.
- Do not set paragraphs or primary navigation in the mono face.
- Use sentence case. Labels may use uppercase mono when they identify a data category.

### Layout and shape

- 8px base scale: `4, 8, 12, 16, 24, 32, 48`.
- Radius: 8px for small controls and glyph tiles; 14px for panels.
- Container strategy: `border`. Use a 1px `--color-border` boundary; do not add card shadows as a second separation system.
- Desktop: fixed 230px dark rail, bounded content canvas, 12px panel gap.
- Mobile: replace the rail with a compact top bar and persistent bottom navigation. Make the live state visible before secondary navigation.

### Icon and motion

- Use a single small custom glyph system or a single outlined icon family. Icons should be compact and secondary to labels.
- Service glyph tiles may take semantic tints; ordinary navigation icons remain monochrome.
- Motion is subtle: 180ms ease for a hover lift of at most 2px and border-color transitions. Respect `prefers-reduced-motion`.

## Component rules

### Navigation

The active destination is a soft charcoal inset in the dark rail; it carries a live dot only when the state is genuinely current. A command entry may sit below the mark but must be labeled and keyboard-hinted.

### System snapshot

Use four or fewer parallel cards. Give one reading a slightly wider card only when its visual form materially helps, such as a CPU activity trace. Every number needs a unit or a plain-language companion.

### Entity lists

Rows contain a glyph, a recognizable name, a single useful secondary fact, and a terse state. Do not turn every item into a card. Use dividers within a bordered surface.

### Live media / rich content

One dark panel may create focus for a currently active, human-facing item such as playing media. Keep the rest of the canvas quiet so this contrast remains meaningful.

### Feedback and states

- Loading: preserve the panel’s geometry with a low-contrast skeleton; do not show a spinner in every card.
- Empty: say what is absent and give one next action, e.g. “No active downloads. Open qBittorrent.”
- Error: name the entity and recovery action, e.g. “Nextcloud has not responded for 2 minutes. Try reconnecting.”
- Success: state what changed, then leave an undo or next action where relevant.
- Permission denied: state the missing access and the owner or setting needed to restore it.

## Copy

Use direct statements based on real user state: “Everything is running,” “3 people watching,” or “Last sync 2 min ago.” Avoid motivational filler, fake system narratives, and vague messages such as “All good.”

## Guardrails

- Never force content into a numbered or directional sequence unless the product has a real sequence.
- Do not reuse the homelab information architecture for unrelated products. Preserve the visual language; derive the hierarchy from that product’s actual daily task.
- Do not default to opaque glass, neon-on-black, oversized rounded cards, or decorative gradient blobs.
- Keep the primary task and current state recognizable within three seconds.
