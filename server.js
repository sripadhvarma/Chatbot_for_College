import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import webSearchDecision from './Chatbot_for_College-main/web_search_decision.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openrouter/free';
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const FRONTEND_DIR = path.join(__dirname, 'Chatbot_for_College-main');

// Local Kokoro TTS server (kokoro_server.py) — British English bf_emma.
const KOKORO_TTS_URL = process.env.KOKORO_TTS_URL || 'http://127.0.0.1:5001/tts';

// Finite hard timeouts for upstream requests so /api/chat and /api/tts always
// settle and the frontend can never be left stuck in a "Thinking" state.
const CHAT_TIMEOUT_MS = 55_000;
const TTS_TIMEOUT_MS = 25_000;

const app = express();
app.use(express.json({ limit: '1mb' }));

// Fetch an upstream URL with an AbortController-backed hard timeout. Any abort
// here means "took too long"; it is re-thrown with a timedOut flag so handlers
// can respond with a clear 504 instead of a generic upstream error.
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      const timeoutError = new Error('Upstream request timed out.');
      timeoutError.timedOut = true;
      throw timeoutError;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    openrouterConfigured: Boolean(OPENROUTER_API_KEY)
  });
});

app.post('/api/chat', async (req, res) => {
  if (!OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'OpenRouter is not configured. Add OPENROUTER_API_KEY to .env and restart the server.' });
  }

  const { contents, systemInstruction, tools } = req.body || {};
  if (!Array.isArray(contents)) {
    return res.status(400).json({ error: 'Missing contents array.' });
  }

  const systemText =
    typeof systemInstruction === 'string'
      ? systemInstruction
      : systemInstruction?.parts?.[0]?.text;
  const manualWebSearch = Array.isArray(tools) && tools.length > 0;

  const messages = [];
  if (systemText) {
    messages.push({ role: 'system', content: systemText });
  }
  for (const entry of contents) {
    const role = entry?.role === 'model' ? 'assistant' : entry?.role;
    const content = (entry?.parts || []).map((p) => p?.text || '').join('');
    if (role !== 'user' && role !== 'assistant') continue;
    if (!content) continue;
    messages.push({ role, content });
  }
  if (messages.length === 0) {
    return res.status(400).json({ error: 'No valid messages to send.' });
  }

  // Auto-enable web search only for genuinely current/specific/factual
  // university questions (e.g. current placements, courses, fees). Manual
  // toggle (tools) always wins; otherwise a narrow detector decides.
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  const autoWebSearch = !manualWebSearch && webSearchDecision.shouldSearchWeb(lastUserMessage?.content || '');
  const webSearchEnabled = manualWebSearch || autoWebSearch;

  const requestBody = {
    model: req.body?.model || OPENROUTER_MODEL,
    messages
  };
  if (webSearchEnabled) {
    requestBody.tools = [{ type: 'openrouter:web_search' }];
  }

  try {
    const response = await fetchWithTimeout(
      OPENROUTER_ENDPOINT,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENROUTER_API_KEY}`
        },
        body: JSON.stringify(requestBody)
      },
      CHAT_TIMEOUT_MS
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const status = response.status;
      const statusMessages = {
        401: 'Invalid OpenRouter API key. Check OPENROUTER_API_KEY in .env.',
        404: `The model was not found on OpenRouter. Check OPENROUTER_MODEL (= "${OPENROUTER_MODEL}").`,
        429: 'OpenRouter rate limit reached. Please wait a moment and try again.'
      };
      const message =
        statusMessages[status] ||
        (status >= 500
          ? 'The OpenRouter provider reported a server error. Please try again shortly.'
          : 'The request was rejected. The model may not support the requested parameters, such as web search.');
      console.error('[/api/chat] OpenRouter responded with status', status);
      return res.status(status).json({ error: message });
    }

    res.json({
      ...mapChatResponse(data),
      webSearchEnabled
    });
  } catch (err) {
    if (err?.timedOut) {
      console.error('[/api/chat] OpenRouter request timed out');
      return res.status(504).json({ error: 'The request to the AI provider took too long. Please try again.' });
    }
    console.error('[/api/chat]', err?.message);
    res.status(502).json({ error: 'Could not reach OpenRouter. Check your network and try again.' });
  }
});

// Proxy to the local Kokoro TTS server. Keeps the fully local TTS architecture:
// browser -> /api/tts -> kokoro_server.py -> audio/wav -> browser playback.
app.post('/api/tts', async (req, res) => {
  const { text, voice, speed } = req.body || {};
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Missing text to speak.' });
  }

  try {
    const response = await fetchWithTimeout(
      KOKORO_TTS_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          voice: typeof voice === 'string' && voice ? voice : undefined,
          speed: typeof speed === 'number' && speed > 0 ? speed : 1.0
        })
      },
      TTS_TIMEOUT_MS
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('[/api/tts] Kokoro responded with status', response.status);
      return res.status(response.status).json({
        error: `Kokoro TTS failed (${response.status}): ${detail}`
      });
    }

    const wavBuffer = Buffer.from(await response.arrayBuffer());
    res.set('Content-Type', 'audio/wav');
    res.set('Cache-Control', 'no-store');
    res.send(wavBuffer);
  } catch (err) {
    if (err?.timedOut) {
      console.error('[/api/tts] Kokoro request timed out');
      return res.status(504).json({ error: 'The local TTS server took too long to respond. Please try again.' });
    }
    console.error('[/api/tts]', err?.message);
    res.status(502).json({
      error: `Could not reach the local Kokoro TTS server at ${KOKORO_TTS_URL}. Is kokoro_server.py running?`
    });
  }
});

app.use(express.static(FRONTEND_DIR));

app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'coll.html'));
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err?.message);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

function mapChatResponse(data) {
  const message = data?.choices?.[0]?.message;
  if (!message || typeof message?.content !== 'string') {
    return { candidates: [] };
  }

  const attributions = [];
  const annotations = Array.isArray(message.annotations) ? message.annotations : [];
  for (const ann of annotations) {
    const ref = ann?.url_citation || ann;
    if (ref?.url) {
      attributions.push({ web: { uri: ref.url, title: ref.title || ref.url } });
    }
  }
  if (attributions.length === 0 && Array.isArray(message.citations)) {
    for (const cit of message.citations) {
      if (cit?.url) {
        attributions.push({ web: { uri: cit.url, title: cit.title || cit.url } });
      }
    }
  }

  return {
    candidates: [
      {
        content: { role: 'model', parts: [{ text: message.content }] },
        ...(attributions.length ? { groundingMetadata: { groundingAttributions: attributions } } : {})
      }
    ]
  };
}

app.listen(PORT, () => {
  console.log(`MRDU AI Campus Assistant running at http://localhost:${PORT}`);
  if (!OPENROUTER_API_KEY) {
    console.log('OPENROUTER_API_KEY is not set. Copy .env.example to .env and add your key to enable chat.');
  }
});