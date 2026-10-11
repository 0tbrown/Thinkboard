import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

// Same-origin by default; the Vite dev server proxies /api to the backend,
// so the app works behind any host (localhost, previews, deployments).
const API_BASE = import.meta.env.VITE_API_BASE || '';

function App() {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const recognitionRef = useRef(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('Hi! Tell me what you’re working on, or write it on the board.');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(true);
  const [history, setHistory] = useState([]);
  const [notice, setNotice] = useState('Ready when you are.');

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#182333';
  }, []);

  function pointFromEvent(event) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const p = event.touches?.[0] || event;
    return { x: (p.clientX - rect.left) * scaleX, y: (p.clientY - rect.top) * scaleY };
  }

  function startDrawing(event) {
    event.preventDefault();
    drawingRef.current = true;
    lastPointRef.current = pointFromEvent(event);
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch {}
  }
  function draw(event) {
    if (!drawingRef.current) return;
    event.preventDefault();
    const next = pointFromEvent(event);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    lastPointRef.current = next;
  }
  function stopDrawing() { drawingRef.current = false; lastPointRef.current = null; }
  function clearBoard() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setNotice('Whiteboard cleared.');
  }

  function startListening() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setNotice('Speech recognition is not supported in this browser. You can type your question, or try a current version of Safari or Chrome.');
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onstart = () => { setListening(true); setNotice('Listening… speak naturally.'); };
    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) transcript += event.results[i][0].transcript;
      setQuestion(transcript);
    };
    recognition.onerror = () => setNotice('I could not hear that clearly. Try again or type your question.');
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
  }

  function speak(text) {
    if (!speakReplies || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.96;
    window.speechSynthesis.speak(utterance);
  }

  // Tutor actions are drawn onto the same canvas as the student's work.
  // Coordinates from the model are normalized (0–1) so they scale to this board.
  function drawTutorAction(action) {
    const canvas = canvasRef.current;
    if (!canvas || !action) return;
    const ctx = canvas.getContext('2d');
    const coord = (value, dimension) => Number(value) <= 1 ? Number(value) * dimension : Number(value);
    const x = coord(action.x ?? 0.08, canvas.width);
    const y = coord(action.y ?? 0.15, canvas.height);
    ctx.save();
    ctx.strokeStyle = action.color || '#315fd0';
    ctx.fillStyle = action.color || '#183b56';
    ctx.lineWidth = Math.max(2, Number(action.width) || 3);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (action.type === 'write' && typeof action.text === 'string') {
      ctx.font = `${Math.max(20, Math.min(42, Number(action.fontSize) || 30))}px Georgia, serif`;
      const words = action.text.split(' ');
      const maxWidth = canvas.width * 0.78;
      let line = '';
      let lineY = y;
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxWidth && line) {
          ctx.fillText(line, x, lineY);
          line = word;
          lineY += 42;
        } else line = test;
      }
      if (line) ctx.fillText(line, x, lineY);
    } else if (action.type === 'line') {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(coord(action.x2 ?? 0.4, canvas.width), coord(action.y2 ?? action.y, canvas.height));
      ctx.stroke();
    } else if (action.type === 'circle') {
      ctx.beginPath();
      ctx.arc(x, y, coord(action.radius ?? 0.025, Math.min(canvas.width, canvas.height)), 0, Math.PI * 2);
      ctx.stroke();
    } else if (action.type === 'rect') {
      ctx.strokeRect(x, y, coord(action.width ?? 0.12, canvas.width), coord(action.height ?? 0.06, canvas.height));
    }
    ctx.restore();
  }

  function presentTutorWork(answerText, actions = []) {
    // Speak and reveal board actions together to imitate a teacher explaining while writing.
    speak(answerText);
    if (!Array.isArray(actions) || actions.length === 0) return;
    actions.slice(0, 12).forEach((action, index) => {
      window.setTimeout(() => drawTutorAction(action), index * 850 + 250);
    });
  }

  async function askTutor(event) {
    event?.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice('Looking at your work and preparing a response…');
    try {
      const whiteboardImage = canvasRef.current.toDataURL('image/png');
      const response = await fetch(`${API_BASE}/api/tutor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, whiteboardImage, history })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Request failed.');
      const nextAnswer = data.answer || 'Let’s work through this together. Can you tell me which part feels confusing?';
      setAnswer(nextAnswer);
      setHistory(prev => [...prev, { role: 'user', content: question || '[Asked about whiteboard]' }, { role: 'assistant', content: nextAnswer }].slice(-8));
      setQuestion('');
      if (data.demo) {
        setNotice('Demo mode: add an OpenAI API key to server/.env for real tutoring. Showing a canned example response.');
      } else {
        setNotice(data.boardActions?.length ? 'I’m explaining and writing on the board. Try the next step when I’m done.' : 'Response ready. Keep talking or write your next step.');
      }
      presentTutorWork(nextAnswer, data.boardActions || []);
    } catch (error) {
      setNotice(error.message || 'Could not connect to the tutor.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => () => {
    recognitionRef.current?.stop();
    window.speechSynthesis?.cancel();
  }, []);

  return <main className="app-shell">
    <header className="topbar">
      <div><div className="eyebrow">CROSS-PLATFORM LEARNING</div><h1>Thinkboard <span>AI Tutor</span></h1><p>Think out loud. Work it out. Learn one step at a time.</p></div>
      <div className="status-pill"><span className="status-dot" /> {busy ? 'Thinking' : listening ? 'Listening' : 'Ready'}</div>
    </header>

    <section className="workspace">
      <div className="board-panel panel">
        <div className="panel-heading"><div><span className="step-label">YOUR WORKSPACE</span><h2>Digital whiteboard</h2></div><button className="quiet-button" onClick={clearBoard} type="button">Clear board</button></div>
        <div className="board-wrap">
          <canvas ref={canvasRef} width="1200" height="760" aria-label="Digital whiteboard. Draw equations, notes, or diagrams here." onPointerDown={startDrawing} onPointerMove={draw} onPointerUp={stopDrawing} onPointerCancel={stopDrawing} onPointerLeave={stopDrawing} />
        </div>
        <div className="board-hint">Use your finger, stylus, mouse, or trackpad to write. Your tutor can also add equations, lines, circles, and diagrams to this same board.</div>
        <form className="ask-form" onSubmit={askTutor}>
          <label htmlFor="question">Ask by voice or text</label>
          <textarea id="question" value={question} onChange={e => setQuestion(e.target.value)} placeholder="For example: I’m stuck on the second step. What should I try next?" rows="3" />
          <div className="form-actions"><button type="button" className={`mic-button ${listening ? 'recording' : ''}`} onClick={startListening}>{listening ? '■ Stop listening' : '🎙 Speak'}</button><button className="primary-button" type="submit" disabled={busy}>{busy ? 'Thinking…' : 'Ask my tutor ↗'}</button></div>
        </form>
      </div>

      <aside className="tutor-panel panel">
        <div className="panel-heading"><div><span className="step-label">YOUR LEARNING PARTNER</span><h2>AI tutor</h2></div><div className="avatar">✦</div></div>
        <div className="tutor-message"><div className="message-label"><span className="mini-avatar">✦</span> Tutor response</div><p aria-live="polite">{answer}</p></div>
        <div className="response-tools"><label className="toggle-row"><input type="checkbox" checked={speakReplies} onChange={e => setSpeakReplies(e.target.checked)} /> Read replies aloud</label><button className="quiet-button" onClick={() => speak(answer)} type="button">▶ Play again</button></div>
        <div className="notice-box"><span className="notice-icon">ⓘ</span><span>{notice}</span></div>
        <div className="how-it-works"><h3>How to learn with me</h3><ol><li><span>1</span><div><b>Show your thinking</b><small>Write a step, equation, or diagram.</small></div></li><li><span>2</span><div><b>Ask out loud</b><small>Explain what feels confusing.</small></div></li><li><span>3</span><div><b>Try the next step</b><small>I’ll guide you, not just give answers.</small></div></li></ol></div>
      </aside>
    </section>
    <footer>Thinkboard prototype · Use a modern browser and an internet connection. Microphone access requires permission.</footer>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
