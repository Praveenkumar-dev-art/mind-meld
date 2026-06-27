🧠 MindMeld — Project Journey Report
Project: MindMeld — AI-Powered Learning Assistant
Repository: D:\mind-meld → github.com/Praveenkumar-dev-art/mind-meld
Period Covered: Session 1 through Current
Status: Production-ready code ✅ | Deployment in progress 🔄

Where We Started
The project began as an existing GitHub repository that was cloned and brought into the workspace. MindMeld is a dual-mode AI-powered learning assistant built with React + TypeScript + Vite, integrated with Google's Gemini AI API.

The app had two core modes from the start:

Diary Mode — a free-form journal where users write, attach images, highlight key terms, and send context to the Tutor
Tutor Mode — a Socratic AI tutor that teaches through SVG diagrams, concept maps, voice conversation, quizzes, and live chat
The raw code was functional but had multiple bugs, production blockers, and no deployment setup. The work began here.

Session 1 — Codebase Audit & Bug Fixing
What We Found
A full codebase review was conducted across every file. Three significant problems were discovered:

Problem	Severity	Detail
UI/UX Scaling Bug	🔴 Critical	App was designed for tablet. On desktop, visual panel collapsed, SVG diagrams overflowed, and the chat bar pushed content off-screen
Invalid AI Model Name	🟡 Medium	gemini.ts was calling "gemini-3.1-pro-preview" — a model name that does not exist, causing silent failures
Tailwind CDN in Production	🟡 Medium	Tailwind was loaded as a 350KB browser script (development-only). Not suitable for production
What Was Fixed
UI/UX Desktop Fix:
Instead of rebuilding the layout from scratch, the app was wrapped in a centered Tablet Frame (max-w-[800px]). This locked the tablet design beautifully onto any desktop screen using a subtle shadow effect. Height constraints were added to prevent the visual panel from collapsing (min-h-[280px]) and SVGs were forced to scale correctly (max-w-full h-auto).

API Stability Fix:
All invalid model name calls were corrected to gemini-2.5-flash and gemini-2.5-pro. Robust fallback logic was added — if the primary model returns a 404 or 429 (rate limit), the app automatically retries with the fallback model.

Security Fix:
The Gemini API key mechanism was refactored. A .env file was added to .gitignore (so keys are never pushed to GitHub), and the app was set up to read the key from a local environment variable.

Session 2 — UI Interactions & Bring Your Own Key System
Resizable Split Pane
The fixed-height visual panel and chat bar were replaced with a drag-to-resize split pane. Users can now drag a handle between the diagram area and the chat section to set the height split they prefer.

Default split: 60% visual / 40% chat
Auto-snaps: collapses fully below 10%, expands fully above 90%
Works on both mouse and touch (mobile-friendly)
The Rope Pull-Tab System
When the split is fully at 0% or 100%, a custom animated rope appears — a hand-crafted SVG of a wavy dashed rope with a grey knot, floating with a @keyframes bob animation. Pulling the rope restores the balanced split. The rope auto-hides after 2 seconds of no cursor activity.

Bring Your Own Key (BYOK) System
This was a significant privacy and security feature. The problem: if the app is hosted publicly, you don't want every user consuming your personal Gemini API quota.

Solution built:

A new ApiKeyModal.tsx component — a centered overlay with a masked password input field (key shows as ••••••) and a direct link to Google AI Studio
A Key icon button added to the top navigation bar — users can open the modal at any time to update their key
gemini.ts was updated to check localStorage first before checking the environment variable
If a user sends a message with no key anywhere, the modal automatically opens with an error message
Result: Every user brings their own free Gemini API key. The app works without the developer's key being exposed or consumed.

Git Commit: 31d786c — "feat: implement resizable split pane, custom rope UI, and BYO API key modal"
10 files changed, 4,091 insertions.

Session 3 — Build Pipeline Migration
The Problem
Tailwind CSS was being loaded as a <script> tag from a CDN in index.html. This meant:

The browser downloaded 350KB of JavaScript just to compile CSS classes on-the-fly at runtime
Every user's first load was slower because of this
The npm run build command was broken — it couldn't produce a proper production bundle
What Was Built
Three new configuration files were created:

tailwind.config.js — tells Tailwind which files to scan so unused CSS is removed (tree-shaking)
postcss.config.js — connects Tailwind to Vite's build process
index.css — a central stylesheet that imports Google Fonts, Tailwind layers, and all custom styles
The index.html was cleaned up from a bloated file with CDN scripts and importmaps to a clean 12-line HTML shell. All styles moved into the proper compiled pipeline.

Results
Metric	Before	After
CSS bundle size	~350KB (browser-compiled)	28KB (compiled, tree-shaken)
npm run build	❌ Broken	✅ Zero errors
Build time	N/A	35.44 seconds
Git Commit: 77add37 — "build: migrate Tailwind from CDN to PostCSS build pipeline, remove import map"

Session 4 — Deployment Branch Setup
Branch Strategy
A decision was made to not mix deployment files with development code. A separate cloudrun branch was created from main. The principle:

main branch → clean developer code, no deployment files, easy for anyone to clone and run locally
cloudrun branch → everything from main + all deployment-specific files
Files Created on cloudrun Branch
Dockerfile — A two-stage build:

Stage 1: Node.js installs packages and compiles the app into dist/
Stage 2: nginx:alpine serves only the compiled files (~25MB final image vs ~900MB if Node was included)
nginx.conf — Configured for Google Cloud Run's required port 8080, with SPA fallback routing (so React handles all URLs), gzip compression, browser asset caching, and security headers.

.dockerignore — Excludes node_modules, dist, .env files, and non-production folders from the Docker image.

setup.md — A deployment reference guide inside the repo itself covering prerequisites, deploy commands, update workflow, and rollback instructions.

Additional Fix on cloudrun Branch
vite.config.ts had a mismatch — it was reading GEMINI_API_KEY from the environment but the .env file had VITE_GEMINI_API_KEY. Since the app is BYOK-only for deployment, this was cleaned up to define both as empty strings — ensuring no API key is ever baked into the compiled bundle.

Git Commits on cloudrun:

0d1a6c2 — "chore: add Dockerfile, nginx.conf, .dockerignore, and setup.md for Cloud Run deployment"
bea16be — "fix: clean env vars for BYOK-only Cloud Run deployment, fill setup.md with deploy guide"
Current Status — Deployment Planning
Where We Are Now
The application code is fully production-ready. The deployment pipeline is set up. The current blocker was the hosting platform.

Google Cloud Run was the original target but was blocked by an Indian debit card restriction (OR_BACR2_44 billing error) — a common issue where Indian banks block international online transactions by default.

Decision: Switch to Render.com — a simpler hosting platform that:

Requires no billing account or credit card
Supports the same Docker-based deployment
Offers a free Static Site tier that never spins down
Auto-deploys from GitHub on every push
Provides a free HTTPS URL
Next Step
Deploy MindMeld to Render.com as a Static Site (serving the compiled dist/ folder directly from a CDN — no server, no Docker needed, no cold starts).

Full Change Summary
Area	What Changed	Impact
Desktop UI layout	Tablet frame wrapper, height constraints, SVG scaling	App works correctly on all screen sizes
AI model names	Fixed invalid model, added 404/429 fallback	Stable API calls, no silent failures
Resizable pane	Drag handle with snap behaviour	Users control their own layout
Rope pull-tab	Custom animated SVG rope system	Intuitive UX when pane is fully collapsed or expanded
BYOK API key modal	ApiKeyModal.tsx, localStorage key management	Public hosting is safe — no developer key exposed
Tailwind build pipeline	CDN removed, PostCSS pipeline added	CSS: 350KB → 28KB, npm run build now works
Deployment branch	cloudrun branch with Dockerfile, nginx, setup guide	Clean separation of dev and deployment code
Env var cleanup	vite.config.ts BYOK-only config	No secrets baked into production bundle
Repository State

origin/main      → Clean development code (latest: 77add37)
origin/cloudrun  → Deployment-ready code  (latest: bea16be)
Report generated — covering all sessions from initial codebase review to current deployment stage.