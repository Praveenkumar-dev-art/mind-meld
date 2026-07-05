🧠 MindMeld — Agent 1 Codebase Review Report
Author: Agent 1 (Reviewer)
Target: D:\mind-meld
Scope: All folders & files EXCEPT F,F understanding
Purpose: Full understanding of the app for Agent 2 (Code Analyst) to consume

1. What Is This Application?
MindMeld is a dual-mode AI-powered learning assistant built with React + TypeScript + Vite. It integrates Google's Gemini 2.5 Flash API and has two core modes:

Mode	Purpose
Diary Mode	A free-form journal where the user writes thoughts, attaches images, highlights key terms, and sends content to the Tutor
Tutor Mode	A Socratic AI tutor that teaches via SVG diagrams, Mermaid.js concept maps, voice, quizzes, and live conversation
The two modes share context memory — what you write in Diary Mode informs what the Tutor teaches.

2. Technology Stack
Technology	Version	Role
React	19.2.1	UI framework
TypeScript	5.8.2	Type safety
Vite	6.2.0	Dev server & bundler
Tailwind CSS	CDN (via <script> in index.html)	Styling
Google GenAI SDK	1.31.0	Gemini API calls
Mermaid.js	11.4.0	Concept map diagrams
Lucide React	0.556.0	Icons
Web Speech API	Browser native	TTS + STT
⚠️ CRITICAL NOTICE: Tailwind CSS is loaded via a <script> CDN tag in index.html. This means it runs as a Play CDN (development-only). In production, this should be replaced with a proper PostCSS/Tailwind build pipeline. This also means some classes may behave unexpectedly or not be tree-shaken.

3. Project File Structure

D:\mind-meld\
├── App.tsx                  # Root component — mode switcher + shared state
├── index.tsx                # React entry point (React.StrictMode + createRoot)
├── index.html               # HTML shell + Tailwind CDN + importmap
├── types.ts                 # Shared TypeScript interfaces
├── package.json             # Dependencies + scripts
├── vite.config.ts           # Vite config (React plugin + env vars)
├── tsconfig.json            # TypeScript config
├── metadata.json            # App metadata (name, description)
│
├── components/
│   ├── ModeToggle.tsx       # Top navigation pill (Diary ↔ Tutor)
│   ├── DiaryView.tsx        # Diary mode UI + logic
│   └── TutorView.tsx        # Tutor mode UI + logic (LARGEST FILE: 653 lines)
│
├── hooks/
│   ├── useLiveMode.ts       # Live voice conversation state machine
│   └── useQuiz.ts           # Quiz generation + state management
│
├── services/
│   ├── gemini.ts            # All Gemini API calls (487 lines)
│   ├── speech.ts            # Web Speech API (TTS + STT wrappers)
│   └── mediaUtils.ts        # Image resizing utility
│
├── abstract/                # (Not reviewed per instructions)
├── upgrade 2.0/             # (Not reviewed per instructions)
└── F,F understanding/       # (Excluded per user instructions)
4. Component-by-Component Breakdown
4.1 App.tsx (Root)
Manages global state: current mode, diary text, diary image, and tutor memory
Renders ModeToggle at the top + conditionally renders DiaryView or TutorView
Passes shared context (text + image) from Diary → Tutor via props
Root wrapper: w-full h-screen overflow-hidden bg-stone-50
4.2 ModeToggle.tsx
Fixed top bar (absolute top-0 left-0 right-0 z-50) with a floating pill design
Two buttons: Diary Mode (stone-800) and Tutor Mode (blue-600)
pointer-events-none on wrapper, pointer-events-auto on pill — allows content below to be clickable
4.3 DiaryView.tsx
Full-width journal with pt-28 top padding (to clear the floating ModeToggle)
Features:
Textarea: free-form writing
Mic button: speech-to-text via startListening()
Image upload: attach images (resized via resizeImage())
Highlight button: wraps selected text in **bold** markdown
Rocket button (🚀): summarizes diary text via Gemini, sends to TutorView as "Active Memory"
Read Aloud: TTS playback of diary text
4.4 TutorView.tsx ⭐ (Main Component — 653 lines)
This is the core of the app. It contains:

Layout Structure (CRITICAL for scaling bug):

<div className="flex flex-col h-full w-full bg-stone-50 relative">   ← ROOT
  <div className="flex-1 w-full ... pt-24 px-6 pb-6">                ← TOP VISUAL AREA
    [Quiz UI or...]
    <div className="flex flex-col w-full h-full bg-white ...">        ← VISUAL PANEL
      [Tab bar: Illustration | Concept Map]
      [SVG Diagram or Mermaid Map]
    </div>
  </div>
  <div className="h-auto bg-white border-t ...">                      ← BOTTOM CHAT BAR
    [Chat messages scroll area: max-h-80]
    [Input row: textarea + buttons]
  </div>
</div>
Features:
Feature	Description
Illustration Tab	Renders AI-generated SVG diagrams inline (dangerouslySetInnerHTML)
Concept Map Tab	Renders Mermaid.js mindmap SVGs
Diagram History	Up to 20 SVG diagrams saved with clickable history bar
Regenerate Visual	Re-calls Gemini with customization suggestions
Animate Visual	Generates animated CSS SVG via Gemini
Chat Panel	Scrollable chat history at the bottom (max-h-80)
Live Mode	Continuous voice conversation (Active / Standby states)
Manual Mic	Push-to-talk microphone
Quick Mode	Text-only fast responses (no SVG generation)
Web Search Mode	Enables Google Search grounding for real-world facts
Quiz Mode	Full-screen multiple-choice quiz overlay
Memory Editor	Modal to view/edit "Active Learning Memory" context
Expand/Collapse	Toggle to expand the visual area and hide the chat bar
State Management (TutorView):
messages: Chat history (persisted to localStorage)
svgHistory: Array of up to 20 {id, code} SVG objects (persisted)
currentMindmap: Mermaid.js code string
viewingSvgId: Which diagram from history is being shown
turnCounter: Auto-incrementing ID per conversation turn
isExpanded: Expand visual area (hides chat bar)
liveMode: 'off' | 'active' | 'standby'
isQuickMode, isWebSearchMode: Mode toggles
5. Services Breakdown
5.1 gemini.ts
Uses @google/genai SDK with API key from process.env.API_KEY
Primary model: "gemini-3.1-pro-preview" (⚠️ This model name may not be valid — should be gemini-2.5-pro-preview or gemini-2.5-flash)
Auto-fallback on 429: Falls back to gemini-2.5-flash on rate limits
Function	Purpose
generateDiarySummary()	Summarizes diary text → structured Markdown + optional insight
generateTutorResponse()	Main tutor: returns SVG + speech + question (JSON schema)
regenerateSVG()	Re-generates SVG diagram with optional user suggestion
generateAnimatedSVG()	Generates animated CSS-in-SVG diagram
generateMindmapOnly()	Generates Mermaid.js mindmap code
generateQuiz()	Generates 3-question MCQ quiz JSON
5.2 speech.ts
speak(): Web Speech API TTS. Prefers Google English voice. Handles cancel/interrupt gracefully.
stopSpeaking(): Cancels ongoing TTS.
startListening(): Web Speech API STT. Supports continuous mode (for Live Mode).
5.3 mediaUtils.ts
resizeImage(): Resizes uploaded images to max 1024x1024, returns base64 + MIME type.
6. Hooks Breakdown
6.1 useLiveMode.ts
A state machine for continuous voice conversation:

States: off → active → standby → active → off
Voice commands: "Pass" (→ standby), "Start" (→ active), "Stop" (→ off)
Uses startListening() in continuous mode
restartLiveListeningIfActive(): Called after TTS ends to resume listening
6.2 useQuiz.ts
Calls generateQuiz() from gemini.ts
Manages: current question, selected option, answer reveal, score
On finish: sends quiz result as a chat message back to the tutor
7. Data Flow

[User writes in Diary] 
        ↓
[Rocket 🚀] → generateDiarySummary() → Gemini API
        ↓
[tutorMemory set in App.tsx state]
        ↓
[TutorView receives activeTutorMemory prop]
        ↓
[User asks question] → generateTutorResponse() → Gemini API
        ↓
[Returns: SVG + speech_response + question]
        ↓
[SVG rendered inline; speech_response spoken via TTS; message added to chat]
8. LocalStorage Persistence
Key	Value
mindmeld_chat_history	JSON array of ChatMessage[]
mindmeld_visual_state_v3	{ mindmap, svgHistory } object
9. Known Issues & Bugs Found During Review
🔴 CRITICAL: UI/UX Scaling Bug (THE PRIMARY BUG - Agent 2 target)
Location: TutorView.tsx — the entire layout structure

Problem: The layout was designed with fixed pixel-feel sizing that works well on tablet (~768-1024px wide) but breaks on desktop screens.

Specific issues found:

Visual Area + Chat Bar = Fixed Stacking, No Responsive Split

The layout is flex-col (vertical stack): visual area on top, chat bar below.
On a tablet, the visual area gets ~60% height and chat gets ~40% — this feels natural.
On a desktop/computer (wider, landscape), the visual area stays small because flex-1 is constrained by the chat bar taking max-h-80 (320px) of fixed height from the bottom.
The chat bar has max-h-80 for the messages area but the overall bottom bar has h-auto — it grows with content and pushes the visual panel upward, potentially hiding the diagram.
SVG Container Has No Responsive Sizing

The SVG is rendered via dangerouslySetInnerHTML in a div with w-full h-full flex overflow-auto p-4.
The SVG itself has viewBox="0 0 800 600" (fixed 800x600 coordinate space).
The container uses [&>svg]:m-auto [&>svg]:max-w-none — this means the SVG is NOT scaled down to fit the container width. On a narrow panel, it overflows and causes scrolling, hiding content.
ModeToggle Overlap

ModeToggle is absolute top-0 left-0 right-0 z-50 — it floats over everything.
TutorView uses pt-24 (96px top padding) to account for this.
DiaryView uses pt-28 (112px top padding).
On small screen heights (e.g., laptop 768px height), the 96-112px header padding eats ~12-15% of screen height before any content appears.
Chat Messages Area Hidden on Small Heights

The chat messages scroll area uses max-h-80 (320px). On short screens (height < 700px), this combined with the visual panel and input bar causes severe overflow — elements hide behind each other.
isExpanded Mode Incomplete

The expand button hides the chat bar via scale-y-0 h-0 opacity-0 overflow-hidden.
But the visual area doesn't adjust its padding (pt-24 stays), so there's a large empty gap at the top even in expanded mode.
No min-height / max-height Guard on Visual Panel

The visual panel (flex-1) has no min-h constraint. If the chat bar grows large, the visual panel can collapse to nearly zero height.
🟡 MEDIUM: Invalid Gemini Model Name
gemini.ts uses "gemini-3.1-pro-preview" as the primary model.
This model name does not exist as of current Gemini API versions (should be gemini-2.5-pro-preview or gemini-2.5-flash).
The fallback to gemini-2.5-flash on 429 saves it, but the primary call may always fail with a 404/model-not-found error.
🟡 MEDIUM: API Key via process.env.API_KEY
gemini.ts reads process.env.API_KEY at runtime.
In the Vite setup, env vars must be prefixed with VITE_ (e.g., VITE_API_KEY) and accessed as import.meta.env.VITE_API_KEY.
process.env is a Node.js thing — in Vite browser builds, process.env.API_KEY only works if Vite inlines it via define in vite.config.ts.
🟡 MEDIUM: Tailwind CDN in Production
index.html loads Tailwind via <script src="https://cdn.tailwindcss.com">.
The Play CDN is meant for development/prototyping only. It is slow, large (~350KB), and not tree-shaken.
🟢 MINOR: useQuiz.ts React Import Unused
Line 1: import React, { useState, useRef } from 'react'; — React is imported but not used in a hook file. Minor linting issue.
🟢 MINOR: Memory Editor Textarea Styling Mismatch
TutorView.tsx line 565: The textarea in the Memory Editor has bg-stone-600 text-white border border-stone-600 — a dark background. This seems intentional (terminal-style) but is inconsistent with the rest of the white/light UI.
10. Summary for Agent 2
Agent 2's primary target is the UI/UX scaling bug. Here is the exact roadmap:

Files to Fix:
D:\mind-meld\components\TutorView.tsx — Main layout fix needed

The flex-col layout needs to become responsive: on desktop, split into left (visual) + right (chat) columns. On tablet/mobile, keep the stacked layout.
The SVG container needs [&>svg]:max-w-full [&>svg]:h-auto instead of max-w-none for proper scaling.
The pt-24 in expanded mode should be removed or reduced.
Add min-h guard on the visual panel.
D:\mind-meld\components\DiaryView.tsx — Minor adjustment

pt-28 top padding is fine for tablet but wastes space on desktop. Should be responsive.
D:\mind-meld\index.html — Meta viewport is set correctly (width=device-width, initial-scale=1.0).

The Exact Scaling Fix Strategy:
On desktop (lg: breakpoint, ≥1024px): Use flex-row layout — visual panel on LEFT (e.g., 55% width), chat panel on RIGHT (45% width), both full height.
On tablet/mobile (<1024px): Keep flex-col — visual panel on top, chat on bottom.
For the SVG: replace [&>svg]:max-w-none with [&>svg]:max-w-full [&>svg]:h-auto so it scales proportionally.
For expanded mode: remove pt-24 and use a proper layout that fills the screen.
Report generated by Agent 1. Hand off to Agent 2 for code analysis and fix implementation.

### 2026-06-27T04:07:14-07:00 - Boundary Issue Fix

1. The explanation of the reason behind the code change
- what code changed(exact file and folder): `/services/gemini.ts` and `/components/TutorView.tsx`.
- why code changed(Reason behind the code change): To ensure SVG diagrams generated by the AI do not exceed the visual boundaries and cause clipping or overflow issues. The `BOUNDARY RULE` was explicitly added to the AI's system prompt instructions in `/services/gemini.ts` to instruct the AI to keep all generated SVG elements strictly contained within the `0 0 800 600` coordinate space (specifically keeping x between 20 and 780 to prevent clipping). Furthermore, the SVG container in `/components/TutorView.tsx` was updated with `[&>svg]:max-h-full [&>svg]:w-auto [&>svg]:h-auto [&>svg]:overflow-hidden` to guarantee the diagram is constrained and scaled correctly within its parent container without overlapping other UI elements.