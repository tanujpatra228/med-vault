# Design System

Med Vault uses the **visual language of the Lekha design system** (fonts, colors, spacing, radii, components). Lekha's wording and finance-specific rules are not used. Source: https://claude.ai/artifact/7cBQoeZi3DgXvhr13T2LpE

The implementation lives in `src/styles.css` as CSS variables and Tailwind theme tokens. Always use tokens; never hard-code a hex value in a component.

---

## The one idea

**A printed medical record, not a neon dashboard.** Warm paper background, serif headlines, hairline dividers, no shadows. Color is used to **point at one thing**, not to decorate.

Each member's summary opens with one plain sentence, e.g. *"Maa is taking 6 medicines from 3 doctors."* A sentence first, details below.

---

## Color

Two themes follow the phone setting: **Paper** (light) and **Ink** (dark).

| Token | Light | Dark | Med Vault use |
|---|---|---|---|
| `paper` | `#fbfaf7` | `#14101c` | App background. Never pure white. |
| `sheet` | `#ffffff` | `#1d1829` | Cards, lists, bottom sheets. |
| `rule` | `#dfdacf` | `#2e2740` | 1px hairline around cards and between sections. The only border. |
| `rule-soft` | `#ede9e1` | `#262036` | Hairline between rows in a list. |
| `ink` | `#171221` | `#f7f4fa` | Primary text, names. |
| `ink-muted` | `#4a4358` | `#b9b2c8` | Supporting text. |
| `ink-faint` | `#6a6376` | `#948ca6` | Dates, eyebrows, helper text. Lightest text allowed. |
| `iris` | `#5b34d6` | `#a78bff` | Primary button, the one focused thing on a screen. |
| `iris-strong` | `#3d1f9e` | `#c4b0ff` | Hover/pressed of iris controls. |
| `iris-surface` | `#ede7fd` | `#251b45` | Tint behind the focused block; initial tiles. |
| `on-iris` | `#ffffff` | `#12091f` | Text on iris fill. |
| `rust` | `#a8450f` | `#ff9e6b` | **Allergies and warnings.** Text and hairlines only. |
| `rust-surface` | `#f7eae2` | `#34211a` | Tint behind the allergy block. At most one per screen. |
| `moss` | `#1f6b4f` | `#5fd1a3` | **Currently taking / active and OK** (e.g. "Taking" flag). |
| `moss-surface` | `#e6f1ec` | `#122e25` | Tint behind a moss flag. |
| `focus-ring` | = `iris` | = `iris` | 2px outline, 2px offset, on every interactive element. |

### Color rules
- **One iris thing per screen** (the primary button or the focused item).
- **Rust, not red.** Allergies use `rust`. Pure red is not used. Destructive buttons use the `danger` button (rust outline).
- **Color never carries meaning alone.** An allergy block says "Allergies"; a flag says "Taking", "Stopped", "Active", "Resolved", "Severe".

---

## Typography

All fonts are Google Fonts (free, SIL OFL).

| Family | Token | Font | Used for |
|---|---|---|---|
| Serif | `font-serif` | **Newsreader** | Summary sentence, screen titles, member names in headers |
| Sans | `font-sans` | **Schibsted Grotesk** | All interface text |
| Mono | `font-mono` | **IBM Plex Mono** | Dates, dosage (`1-0-1`), strengths, counts, uppercase eyebrows |
| Devanagari | `font-devanagari` | **Anek Devanagari** | Reserved for a future Hindi UI |

| Style | Family | Size / line | Weight | Use |
|---|---|---|---|---|
| `statement-xl` | serif | 34/44, -0.01em | 500 | Not used on phone screens by default (too large); onboarding only |
| `statement-lg` | serif | 27/36, -0.01em | 500 | The summary sentence; one per screen |
| `statement-md` | serif | 22/32 | 400 | Supporting sentence |
| `display-lg` | serif | 34/38, -0.015em | 600 | Screen title (Home "Family", member name) |
| `title` | sans | 20/26 | 600 | Section titles, sheet headers |
| `body` | sans | 15/23 | 400 | Default text. Minimum size for anything you must read to act |
| `body-strong` | sans | 15/23 | 600 | Primary line of a row (medicine name, member name) |
| `label` | sans | 13/18 | 500 | Buttons, chips, second line of a row |
| `caption` | sans | 12/17 | 400 | Helper text under inputs, timestamps |
| `meta` | mono | 11/15, 0.12em, UPPERCASE | 400 | Eyebrows and section keys |
| `amount-md` | mono | 15/22 | 500 | Dosage, strength, dates in rows (tabular numbers) |

Dates are shown as `11 Oct 2026` (`en-IN`). Relative hints ("3 days ago") go in `caption`.

---

## Layout

- Screen gutter: `space-5` (20px) on every edge.
- Sections separated by `space-8` (32px) and one `rule` hairline.
- Rows inside a list separated by `rule-soft`.
- The summary sentence gets generous air (`space-8` to `space-12`).
- Max content width 640px, centered (comfortable on tablets too).
- Touch targets **48px minimum**.

### Spacing
`space-1` 4 · `space-2` 8 · `space-3` 12 · `space-4` 16 · `space-5` 20 · `space-6` 24 · `space-8` 32 · `space-12` 48

### Radius
`radius-sharp` 0 · **`radius-sm` 3px (default: buttons, cards, chips, inputs)** · `radius-md` 8px (initial tiles, inline alerts) · `radius-lg` 20px (bottom sheet top corners) · `radius-full` (avatars)

### Shadow
**None.** Depth comes from hairlines. The only shadow is `shadow-sheet` on the bottom sheet.

---

## Components

UI is built on **shadcn/ui** components (copied into `src/components/ui/`, built on Radix), restyled with the tokens above. shadcn's CSS variables (`--background`, `--primary`, `--border`...) are aliases of the Lekha tokens in `src/styles.css`, so any new shadcn component picks up the design system automatically.

| shadcn component | Used as | Where |
|---|---|---|
| `Button` | Button (primary / secondary / destructive / ghost / link) | Everywhere |
| `Badge` | Flag (dot + word) | Taking / Stopped, Active / Resolved, Severe, Latest |
| `Card` | Card | Containers |
| `Input`, `Textarea`, `Label` | Form fields | All forms |
| `NativeSelect` | Select (native picker on Android) | Doctor, type, severity, status |
| `Tabs` | Profile tabs | Member profile |
| `Drawer` (vaul) | Bottom sheet | + Add menu |
| `AlertDialog` | Delete confirmation | Every delete |
| `Dialog` | Full-screen photo viewer | Prescription / report photos |
| `Avatar` | Member photo | Available for profile photos |
| `Separator`, `Skeleton` | Hairline, loading placeholder | Layout |
| `Sonner` | Toasts | Save / error feedback |

Candidates for later phases: `Calendar` + `Popover` (if native date inputs are not enough), `Command` (search), `Chart` (lab trends), `Switch` (reminders), `Progress` (uploads).

Med Vault components built on top of these live in `src/components/` (`Row`, `Field`, `FormPage`, `PhotoPicker`, `FileGallery`, `AddSheet`, `DoctorPicker`, `Mark`).

| Component | Spec |
|---|---|
| **Button** | 48px tall, `radius-sm`, `label` text, 1px border. Variants: `primary` (iris fill, on-iris text), `secondary` (transparent, `rule` border, ink text), `danger` (rust text + border), `quiet` (iris text, no border), disabled (ink-faint text, rule border). Full width for the one action at the end of a form. |
| **Row** (from LedgerRow) | Min 64px, initial tile 36px (`radius-md`, `iris-surface`, 2 letters), primary line `body-strong`, second line `label` in `ink-faint`, right side mono value (e.g. dosage or date). Rows sit in a `sheet` card with `rule` border and `rule-soft` separators. |
| **Flag** | 24px tall chip, `radius-sm`, 1px border, 6px dot + word. Variants: `warn` (rust), `ok` (moss), `focus` (iris), `neutral` (rule/ink-muted). Always includes the word. |
| **Statement** | Serif sentence at the top of the summary. Numbers inside it in mono. |
| **Eyebrow** | `meta` style uppercase mono label above a section. |
| **Card** | `sheet` background, 1px `rule` border, `radius-sm`, no shadow, `space-4` padding. |
| **Input** | 48px, `sheet` background, 1px `rule` border, `radius-sm`, focus: iris border + focus ring. Label above in `label`, helper below in `caption`. |
| **Bottom sheet** | `sheet` background, `radius-lg` top corners, `shadow-sheet`. Used for the + Add menu. |
| **Tabs** | Horizontal scrollable text tabs, `label` style; active tab in ink with a 2px ink underline; inactive in ink-faint. |
| **Mark** | Med Vault's mark: a plus/cross built from five 3px-radius tiles in the Lekha tile style, four in `ink` and the center in `iris`. Used as logo, loader (center tile pulses) and empty state (outlined tiles). |

## Charts

Lab trends follow the dataviz method:
- **Line:** a single 2px line with 4.5px points. Each point has a 2px ring in the surface color.
- **Normal range:** a moss band at 10% opacity.
- **Out-of-range points:** the status color, always with "High"/"Low" text.
- **Gridlines and annotations:** hairline gridlines, and medicine changes as hairline annotations.
- **Readout:** a crosshair readout on hover or tap.
- **Values:** always repeated in a table under the chart.

| Token | Light | Dark |
|---|---|---|
| `--chart-line` | `--iris` (#5b34d6) | #9575f5 |
| `--chart-out` | `--rust` (#a8450f) | #e06f35 |
| `--chart-band` | `--moss` | `--moss` |

The dark steps are separate because the UI's dark iris and rust are too light for chart marks. Both pairs pass the palette validator, covering the lightness band, CVD separation and 3:1 contrast against the sheet.

## Iconography

- Stroke only, 1.75px, 24px box, round caps, `currentColor`. No filled icons, no emoji.
- Icons are functional (back, add, camera, phone, close). Rows use initial tiles instead of decorative icons.

## Accessibility

- All text tokens meet 4.5:1 on their grounds in both themes.
- Focus ring on every interactive element; never removed.
- Meaning never by color alone.

## Do not

- No gradients, glassmorphism, or blue-to-purple washes.
- No left-border accent cards.
- No emoji in the UI.
- No shadows except the bottom sheet.
- No red/green pairs. Use rust (warning) and moss (OK), both sparingly.
