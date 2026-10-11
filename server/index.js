import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';

const app = express();
// Set CLIENT_ORIGIN to your exact deployed frontend origin in production.
// Without it, any origin is reflected so the dev/preview proxy keeps working.
const allowedOrigin = process.env.CLIENT_ORIGIN || true;
app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: '12mb' }));

const apiKey = process.env.OPENAI_API_KEY;
const client = apiKey && apiKey !== 'your_api_key_here' ? new OpenAI({ apiKey }) : null;
if (!client) {
  console.warn('OPENAI_API_KEY is not set — running in DEMO MODE with canned tutor responses. Add a key to server/.env for real tutoring.');
}

app.get('/api/health', (_req, res) => res.json({ ok: true, mode: client ? 'live' : 'demo' }));

app.post('/api/tutor', async (req, res) => {
  try {
    const { question = '', whiteboardImage = null, history = [] } = req.body ?? {};
    if (!question.trim() && !whiteboardImage) {
      return res.status(400).json({ error: 'Add a spoken/typed question or write something on the board first.' });
    }
    if (whiteboardImage && !/^data:image\/(png|jpeg|webp);base64,/.test(whiteboardImage)) {
      return res.status(400).json({ error: 'Whiteboard image must be a PNG, JPEG, or WebP data URL.' });
    }

    // Keep only a small amount of recent conversation context.
    const safeHistory = Array.isArray(history)
      ? history.slice(-8).filter(m => ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')
      : [];

    // Demo mode: no API key configured, so return a canned response that
    // exercises the whiteboard actions so the app is fully usable in previews.
    if (!client) {
      return res.json({
        demo: true,
        answer: 'Welcome to Thinkboard! I am running in demo mode because no OpenAI API key is set on the server — add one to server/.env to get real tutoring. Meanwhile, here is what working with me looks like. Let’s solve 2x + 4 = 10 together. First, subtract 4 from both sides to get 2x = 6. Now you try the last step — what do we divide both sides by?',
        boardActions: [
          { type: 'write', text: '2x + 4 = 10', x: 0.08, y: 0.2, fontSize: 34, color: '#315fd0' },
          { type: 'line', x: 0.08, y: 0.26, x2: 0.42, y2: 0.26, color: '#315fd0' },
          { type: 'write', text: '2x = 6', x: 0.08, y: 0.42, fontSize: 32, color: '#315fd0' },
          { type: 'write', text: 'x = 3', x: 0.08, y: 0.58, fontSize: 32, color: '#22a06b' },
          { type: 'circle', x: 0.12, y: 0.555, radius: 0.055, color: '#22a06b' }
        ]
      });
    }

    const content = [{ type: 'input_text', text: `Student's question or spoken words: ${question || '(No question spoken; inspect the whiteboard and ask what they need help with.)'}

Look at the whiteboard image. Act like a real live tutor: respond conversationally and write a small amount on the shared board as you explain. Return ONLY valid JSON with this shape:
{
  "answer": "the concise spoken explanation",
  "boardActions": [
    {"type":"write","text":"2x + 4 = 10","x":0.08,"y":0.18,"fontSize":30,"color":"#315fd0"},
    {"type":"line","x":0.08,"y":0.22,"x2":0.45,"y2":0.22,"color":"#315fd0"},
    {"type":"circle","x":0.5,"y":0.3,"radius":0.03,"color":"#315fd0"},
    {"type":"rect","x":0.1,"y":0.4,"width":0.2,"height":0.08,"color":"#315fd0"}
  ]
}
Coordinates x, y, x2, y2, radius, width and height should normally be normalized from 0 to 1 relative to the board. For line use x/y as start and x2/y2 as end. For circle use x/y as its center and radius as a fraction of the smaller board dimension. For rect use x/y as top-left and width/height as fractions of board dimensions. Use only the action types write, line, circle, rect. Keep to 1–5 useful actions per response; do not fill the whole board or cover the student's work. Place new work in a clear area when possible. Prefer writing the next teaching step, not a complete answer. The answer should explain what you are writing. If no board action would help, return an empty boardActions array. Ask one focused question when useful. Do not claim to see anything unclear.` }];
    if (whiteboardImage) content.push({ type: 'input_image', image_url: whiteboardImage, detail: 'high' });

    const response = await client.responses.create({
      model: 'gpt-4o',
      instructions: 'You are a patient, encouraging tutor for students. Prioritize spoken, conversational guidance. Refer to visible writing, equations, diagrams, and the student’s exact question. Do not claim to see anything that is unclear. Ask one question at a time and scaffold rather than immediately giving away the answer.',
      input: [
        ...safeHistory.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content }
      ],
      max_output_tokens: 650,
      text: { format: { type: 'json_object' } }
    });

    const raw = response.output_text || '{}';
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = { answer: raw, boardActions: [] }; }
    const allowedTypes = new Set(['write', 'line', 'circle', 'rect']);
    const boardActions = Array.isArray(parsed.boardActions)
      ? parsed.boardActions.filter(a => a && allowedTypes.has(a.type)).slice(0, 12)
      : [];
    res.json({
      answer: typeof parsed.answer === 'string' ? parsed.answer : 'Let’s work through this together. What part feels confusing?',
      boardActions
    });
  } catch (error) {
    console.error('Tutor request failed:', error?.message || error);
    res.status(500).json({ error: 'The tutor could not respond right now. Check the server setup and try again.' });
  }
});

const port = Number(process.env.PORT || 3001);
app.listen(port, () => console.log(`Thinkboard tutor server listening on http://localhost:${port}${client ? '' : ' (demo mode — no OPENAI_API_KEY)'}`));
