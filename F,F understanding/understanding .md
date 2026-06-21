1. Tell me how the code base is being structured and how it has been pipelined

**Codebase Structure:**

The project is built as a typical modern React application using Vite as the bundler. Here is a breakdown of the file structure layer by layer:

*   **Root Level & Configurations:**
    *   `index.html`: The HTML entry point where the React app is injected.
    *   `index.tsx`: The main JavaScript entry point that renders the React tree.
    *   `App.tsx`: The primary root component holding the main layout and routing/state logic.
    *   `package.json` & `vite.config.ts`: Define the frontend build tools, dependencies, and local development environment configurations.
    *   `tsconfig.json`: Defines the TypeScript rules for type safety across the project.
    *   `types.ts`: A centralized file storing all global TypeScript interfaces and data models used across the app.

*   **UI Components (`/components/`):**
    *   `TutorView.tsx`: The main interface for interacting with the AI tutor interactively.
    *   `DiaryView.tsx`: The interface for the student's reflective journaling.
    *   `ModeToggle.tsx`: A standard utility component for toggling light/dark accessibility modes.

*   **Custom React Hooks (`/hooks/`):** 
    *   `useLiveMode.ts`: Manages the state and WebRTC/media integrations for "Live" voice interactions.
    *   `useQuiz.ts`: Handles the logic for maintaining quiz state (current question, scoring, and user answers).

*   **External Integrations & Services (`/services/`):**
    *   `gemini.ts`: Manages the connection and API calls to Google's Gemini LLM.
    *   `speech.ts`: Integrates with the browser's native Web Speech API for Text-to-Speech (TTS) and Speech-to-Text (STT).
    *   `mediaUtils.ts`: Helper methods for parsing, formatting, or handling audio/media streams.

*   **Documentation (`/abstract/` & `/upgrade 2.0/`):**
    *   These folders contain markdown files (`technical.md`, `architecture-flow.md`, `research.md`), raw text, and images (`flow-diagram.svg`) conceptualizing the project scope and version updates.

**The Pipeline (How the App Functions):**

1.  **Bootstrapping:** User opens the app. `vite` serves `index.html` -> loads `index.tsx` -> mounts `App.tsx` into the browser DOM.
2.  **User Interaction (Frontend execution):** A user navigates to the `TutorView.tsx` to start learning. 
3.  **State Management (Hooks layer):** `TutorView` triggers `useLiveMode.ts` (if using voice mode) or `useQuiz.ts` depending on the activity context.
4.  **Backend/AI Communications (Services layer):** 
    *   If the user speaks, `useLiveMode.ts` calls `speech.ts` to convert audio to text.
    *   The transcribed text is sent to `gemini.ts`, which packages the message into a prompt and posts it to the Gemini API.
5.  **Response & Feedback Loop:** 
    *   Gemini returns a generative response (conversational instructions or quiz questions).
    *   The service passes the data back to the hook.
    *   The hook updates React's state, causing `TutorView.tsx` to re-render.
    *   Parallelly, `speech.ts` might convert Gemini's text back into speech out loud for multimodal interaction.
