\# Design System: ShiftSync (Light Mode)



\## 1. Brand Vibe \& Principles

\* \*\*Keywords\*\*: Light, Airy, Minimalist, Professional, Frictionless.

\* \*\*Concept\*\*: A pure light-mode experience. The app should feel incredibly clean and easy to scan, like a modern consumer app (e.g., Airbnb, Notion). Abundant whitespace, soft borders, and zero dark/heavy blocks.



\## 2. Color Palette

\* \*\*Primary (Brand / CTA)\*\*: `#2563EB` (Vibrant Trust Blue) - used for primary buttons, active states, and highlighting the selected time slots.

\* \*\*Secondary / Accent\*\*: `#DBEAFE` (Soft Blue Tint) - used for hover states and subtle backgrounds behind active elements.

\* \*\*Backgrounds\*\*: 

&#x20; \* App Background: `#F3F4F6` (Cool Light Gray) - creates a soft canvas.

&#x20; \* Surface/Cards: `#FFFFFF` (Pure White) - pops out against the light gray.

\* \*\*Semantic Colors\*\*:

&#x20; \* \*\*Success / Staffed\*\*: `#059669` (Clean Green) - indicates a shift is covered.

&#x20; \* \*\*Danger / Action Required\*\*: `#DC2626` (Crisp Red) - indicates a missing employee.

\* \*\*Text\*\*:

&#x20; \* Primary Text: `#1F2937` (Deep Gray/Near Black) - softer on the eyes than pure black.

&#x20; \* Secondary Text: `#6B7280` (Medium Gray) - for dates, secondary labels, and inactive tabs.



\## 3. Typography

\* \*\*Font Family\*\*: `Assistant`, `Rubik`, or `Inter`.

\* \*\*Headings\*\*: Semi-Bold (600) or Bold (700), clean and uncrowded.

\* \*\*Body Text\*\*: Regular (400), highly legible.



\## 4. UI Components \& Geometry

\* \*\*Border Radius\*\*: 

&#x20; \* Buttons, inputs, and pills: `8px` to `12px` (friendly and clickable).

&#x20; \* Main Cards and Containers: `16px`.

\* \*\*Shadows \& Borders\*\*:

&#x20; \* Avoid heavy shadows. Use very soft, diffused shadows (`box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);`) to separate white cards from the light gray background.

&#x20; \* Use delicate borders (`#E5E7EB`) to define input fields.

\* \*\*Inputs \& Forms\*\*:

&#x20; \* White background with a light gray border. When focused, the border turns `#2563EB` with a soft blue ring.



\## 5. Layout Rules (Right-to-Left - RTL)

\* The UI must be structured for Hebrew (RTL direction). 

\* Align text to the right, placing icons/back buttons on the left.

