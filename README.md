# Thinkboard

**Source code for Thinkboard — a cross-platform "Talk & Write" AI tutor.**

Thinkboard is a browser-based learning app for modern iPadOS, Android, Windows, and ChromeOS tablets. It combines:

- A touch/stylus digital whiteboard
- Speech-to-text through the browser's Web Speech API where supported
- Spoken tutor replies through browser text-to-speech
- Vision + text reasoning through the OpenAI Responses API
- AI-generated whiteboard actions: the tutor can write text/equations and draw lines, circles, and rectangles on the shared canvas
- Tutor board actions revealed progressively while the spoken answer plays — a basic explain-while-writing presentation
- A server-side API key so the secret is never shipped to the browser

## Architecture

```
Any Tablet (iPad · Windows · Chromebook · Android)
  Microphone + Touchscreen + Digital Whiteboard
        │
Cross-Platform Web App (React · Vite · client/)
  Captures speech, handwritten work, typed questions, and images
        │
AI Orchestration Backend (Node · Express · server/)
  Audio processing · Vision processing · AI reasoning · Session context
        │
Real-Time AI Tutor
  Speaks to the student, observes their work, asks follow-up questions, provides hints
```

The app runs in a web browser instead of relying on device-specific APIs. It never captures the tablet's entire screen — it observes its own whiteboard directly, which is portable and gives better control over student privacy.

## Important compatibility note

This is a cross-platform web app, not a native app for every device. Browser speech recognition availability differs by device/browser and usually requires HTTPS (localhost is okay for development). If a browser does not support speech recognition, the student can type instead. For a production app requiring consistent, low-latency speech-to-speech, replace the browser speech layer with OpenAI's Realtime API over WebRTC and mint short-lived client secrets from the server.

## Requirements

- Node.js 20+ recommended
- An OpenAI API key with API billing/access enabled
- A modern browser

## Run locally

1. Copy `server/.env.example` to `server/.env`.
2. Put your key in `server/.env` as `OPENAI_API_KEY=...`.
3. From the project root, run:

   ```bash
   npm run install:all
   npm run dev
   ```

4. Open `http://localhost:5173`.

The frontend runs on port 5173 and the backend on port 3001; the dev server proxies `/api` to the backend, so the browser only ever talks to one origin. Never put the standard OpenAI API key in `client/` or commit `.env` to source control.

**No API key handy?** The server runs in a clearly-labeled **demo mode** when `OPENAI_API_KEY` is missing: the whiteboard, voice input, and spoken replies all work, and "Ask my tutor" returns a canned example (including sample board writing) so you can try the full flow.

## How it works

1. The student writes on the canvas and speaks or types a question.
2. The frontend exports the canvas as a PNG data URL and sends it with the question and a short conversation history to the backend.
3. The backend calls the OpenAI Responses API with text and image input.
4. The tutor returns a spoken explanation plus structured board actions. The frontend draws the tutor's text/equations and simple shapes onto the same canvas as the student's work, progressively while the explanation is read aloud.

| Component | Technical approach | Purpose |
| --- | --- | --- |
| Whiteboard | HTML Canvas API | Captures student drawings, equations, and diagrams |
| Voice input | Web Speech API | Converts spoken questions to text where supported |
| AI reasoning and vision | OpenAI Responses API (gpt-4o) | Analyzes the question and whiteboard image together |
| Spoken response | Browser speech synthesis | Reads the tutor's explanation aloud |

## Project layout

```
client/src/main.jsx   — interactive whiteboard, microphone controls, and tutor interface
client/src/styles.css — responsive design for tablet and desktop screens
server/index.js       — backend that sends text and whiteboard images to the AI model
server/.env.example   — secure API key configuration template
```

`tablet-ai-tutor-with-board-actions.zip` is the original starter archive this project was built from.

## Production checklist

- Deploy the frontend and backend over HTTPS.
- Set `CLIENT_ORIGIN` on the server to your exact deployed frontend origin.
- Add authentication, rate limiting, usage limits, request-size limits, and monitoring.
- Add consent and a clear policy for student data, especially if children use the product.
- Avoid storing student audio, images, or conversation history unless necessary and disclosed.
- Consider a dedicated realtime audio session for natural interruption, turn-taking, and lower latency (OpenAI Realtime API over WebRTC).
- Add live learning-state detection: track whiteboard changes and update the tutor's understanding continuously, instead of waiting for the **Ask my tutor** button.
- Test touch, stylus, keyboard, screen reader, and browser permissions on each target tablet/browser.

## Current prototype limitations

- It sends a whiteboard snapshot when the student presses **Ask my tutor**, rather than continuously streaming board changes.
- Tutor writing is rendered as typed text and simple shapes, not natural-looking pen strokes or full math typesetting. Speech and drawing are synchronized approximately, not word-perfectly.
- It uses browser speech recognition, which is not consistently available on every browser.
- It is a starter project, not a production-ready or formally security-audited service.
