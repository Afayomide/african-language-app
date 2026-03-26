# Design System Document

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Modern Griot."** 

Just as a Griot preserves history and language through a rich, multi-layered oral tradition, this system treats digital space as an editorial canvas for culture. We are moving away from the "plastic" feel of traditional gamified apps toward a high-end, tactile experience. The design breaks the standard rigid grid through **intentional layering and tonal depth**, using the warmth of African textiles (terracotta, gold, and deep greens) to create a sophisticated, scroll-free environment. Layouts are treated as "staged" scenes where every element has a physical weight and purpose, ensuring that even a learning app feels like a premium cultural artifact.

---

## 2. Colors: Tonal Depth over Borders

The palette is rooted in Earth and Artifice—terracotta for action, gold for achievement, and deep greens for growth.

### The "No-Line" Rule
**Borders are prohibited for sectioning.** To define space, you must use background color shifts. For example, a card (`surface-container-low`) should sit on the main `surface` without a 1px line. The contrast between the two tokens is sufficient to communicate boundaries.

### Surface Hierarchy & Nesting
We treat the UI as stacked sheets of fine paper. 
- **Surface (Background):** The base canvas.
- **Surface-Container-Low:** Secondary containers or lesson cards.
- **Surface-Container-Highest:** Elevated interaction points or "Word Focus" areas.
Nesting these creates a natural, physical depth that feels premium rather than flat.

### The "Glass & Gradient" Rule
To inject "soul" into the UI, use Glassmorphism for floating elements (like progress bars or navigation overlays). Apply `surface` colors with a 60-80% opacity and a `backdrop-blur` of 12px-20px. 
**Signature Texture:** Main CTAs should utilize a subtle linear gradient from `primary` to `primary-container` (at a 45-degree angle) to mimic the sheen of woven silk textiles.

---

## 3. Typography: Editorial Authority

We use a high-contrast pairing to balance friendliness with sophistication.

*   **Display & Headlines (Plus Jakarta Sans):** These are our "Voice" fonts. Use `display-lg` for achievement milestones and `headline-md` for lesson titles. The geometric yet warm nature of Plus Jakarta Sans provides a clean, authoritative look.
*   **Body & Labels (Manrope):** Manrope is used for all functional text. Its modern, highly legible structure ensures that even complex African orthography (accents and tonal marks) remains clear at small sizes.

**Hierarchy Tip:** Use `label-md` in all-caps with a `0.05em` letter-spacing for category headers (e.g., "WORD FOCUS") to give the layout an editorial, "Museum Label" feel.

---

## 4. Elevation & Depth

### The Layering Principle
Depth is achieved through **Tonal Layering**. Instead of using shadows to separate every item, stack your tokens. A `surface-container-lowest` card placed on a `surface-container-low` background creates a "soft lift" that is easier on the eyes and feels more integrated into the overall aesthetic.

### Ambient Shadows
Shadows should only be used for "Floating" elements (e.g., a "Continue" button or a modal). 
- **Spec:** `0px 8px 24px`.
- **Color:** Use a tinted version of `on-surface` at 6% opacity. Never use pure black or grey; the shadow must feel like it is cast by the warm terracotta or gold surrounding it.

### The "Ghost Border" Fallback
If a border is required for accessibility (e.g., in a high-glare environment), use the `outline-variant` token at **15% opacity**. A 100% opaque border is considered a design failure in this system.

---

## 5. Components

### Buttons
- **Primary:** Gradient (`primary` to `primary-container`), `xl` (1.5rem) rounded corners. Use `on-primary` for text.
- **Secondary:** `surface-container-highest` background with `primary` colored text. No shadow.
- **State Change:** On press, the button should physically sink (a 2px translateY) rather than just changing color.

### Lesson Cards & Lists
- **Prohibition:** Do not use horizontal divider lines.
- **Styling:** Separate list items using `spacing.2` (0.7rem) of vertical white space. Use `surface-container-low` as the base for the list and `surface-container-lowest` for the individual items to create a nested, "inset" look.

### Word Focus Chips
- **Selection Chips:** Use `secondary-container` for the background and `on-secondary-container` for text.
- **Interaction:** When selected, scale the chip by 1.05x and apply an `Ambient Shadow`.

### Progress Bars
Progress bars should feel "full." Use `primary` for the fill and `surface-container-highest` for the track. The track should have a subtle inner shadow to look recessed into the interface.

---

## 6. Do's and Don'ts

### Do:
- **Do** use intentional asymmetry. Place a "Word Focus" card slightly off-center if it creates a more dynamic editorial feel.
- **Do** maximize the Spacing Scale. Use `spacing.8` (2.75rem) to breathe between major sections to maintain a "scroll-free" mobile feel.
- **Do** ensure all tonal marks in African languages are clearly legible by using a minimum of `body-lg` for learning phrases.

### Don't:
- **Don't** use 1px solid borders. Rely on background shifts.
- **Don't** use standard "Duolingo Green." Stick to the `tertiary` (deep green) and `primary` (terracotta) palette to maintain the sophisticated African textile inspiration.
- **Don't** crowd the screen. If the content doesn't fit without scrolling, simplify the lesson or split the card into two layers.