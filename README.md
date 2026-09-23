# MRDU – AI-Powered College Information Chatbot

An AI-powered conversational assistant for questions about Malla Reddy Deemed to be University (MRDU), with text, browser voice input, and local voice output.

## About Malla Reddy Deemed to be University

Malla Reddy Deemed to be University (MRDU) is a higher-education institution in Hyderabad, Telangana, India. The university's official About information describes its focus on academic development, engineering research, innovation, and preparing students for future professional and societal needs.

This project is separate from the university itself. It is a software project that provides an interface for asking questions and retrieving AI-generated answers. University information can change, so current admissions, programmes, fees, contacts, facilities, and other institutional details should be checked against official sources.

- **Official website:** <https://mrdu.edu.in/>
- **Official About page:** <https://mrdu.edu.in/about>

## About This Project

The MRDU College Chatbot is an AI-powered college information chatbot designed for students and visitors. Students often need to search different university pages or contact different departments to find information. This project provides a conversational interface for accessing information in one place.

The browser frontend sends chat requests to a local Node.js/Express backend. The backend keeps the OpenRouter credential server-side, sends supported requests to OpenRouter, and proxies text-to-speech requests to a locally running Kokoro service.

## Key Features

- AI chatbot for college-information questions
- Text-based conversation in the browser
- OpenRouter AI integration
- Optional OpenRouter web-search grounding:
  - A user can enable the Live Web Search control.
  - The backend also automatically enables search for a narrow set of current or externally verifiable topics, such as admissions, fees, courses, placements, contacts, and events.
- Voice assistant activated with the **“Hey MRDU”** wake word
- Wake-word normalization, explicit aliases, controlled fuzzy matching, and strict word-position checks
- Same-sentence voice commands, such as “Hey MRDU, what courses are offered?”
- Browser speech recognition through the Web Speech API when supported by the browser
- Local Kokoro text-to-speech using the British English `bf_emma` voice
- Quick Ask buttons for common topics
- Chat reset/clear control
- Local Node.js/Express backend
- Server-side OpenRouter API-key handling
- Automated wake-word and web-search-decision tests

## How the Voice Assistant Works

```text
User
  |
  v
"Hey MRDU"
  |
  v
Wake-word detection
  |
  v
Voice question
  |
  v
Node.js backend
  |
  v
OpenRouter
  |
  v
AI response
  |
  v
Kokoro TTS
  |
  v
Spoken response
```

The browser uses the Web Speech API for speech recognition. The frontend sends the recognized question to the Node.js backend, which obtains the AI response from OpenRouter. For spoken output, the backend forwards the text to the local Kokoro server, receives WAV audio, and returns it to the browser for playback.

The wake-word helper deliberately does not use unlimited fuzzy matching. It normalizes punctuation and whitespace, accepts a defined set of speech-recognition aliases, applies bounded Levenshtein matching, and checks the position of the wake phrase. Interim wake-word results are not submitted as questions. A final result can contain both the wake word and the question.

## System Architecture

```text
Browser / Chatbot_for_College-main/coll.html
        |
        v
Node.js + Express / server.js
        |
        +------> OpenRouter
        |
        +------> Kokoro TTS / kokoro_server.py
                         |
                         v
                      WAV audio
                         |
                         v
                     Browser
```

Kokoro currently runs as a local FastAPI service on port `5001`. The supplied development launcher starts it through WSL2, while the Node.js/Express application runs on the local machine on port `3000`.

## Technology Stack

| Area | Technologies |
| --- | --- |
| Frontend | HTML, CSS, JavaScript, Web Speech API |
| Backend | Node.js, Express |
| AI | OpenRouter |
| Text-to-speech | Kokoro, FastAPI, Uvicorn, Python |
| Testing | Node.js built-in test runner |
| Environment | Windows, with WSL2 used by the supplied Kokoro launcher |

The frontend also loads browser-side libraries from CDNs, including Tailwind CSS, Font Awesome, Marked, and the Inter font.

## Project Structure

| File | Purpose |
| --- | --- |
| `Chatbot_for_College-main/coll.html` | Main chatbot frontend, chat controls, Quick Ask buttons, browser speech recognition, wake-word flow, and Kokoro audio playback |
| `server.js` | Node.js/Express server; serves the frontend, communicates with OpenRouter, and exposes `/api/health`, `/api/chat`, and `/api/tts` |
| `Chatbot_for_College-main/wake_word.cjs` | Wake-word normalization, aliases, controlled fuzzy matching, question extraction, transcript filtering, and voice-session helpers |
| `wake_word.test.mjs` | Automated wake-word and voice-transcript tests |
| `Chatbot_for_College-main/web_search_decision.cjs` | Narrow detector used by the backend to decide when current or specific questions should request OpenRouter web search |
| `web_search_decision.test.mjs` | Tests for the web-search decision detector |
| `kokoro_server.py` | Local Kokoro TTS server using FastAPI/Uvicorn, with the British English `bf_emma` voice on port `5001` |
| `package.json` | Node.js metadata, dependencies, and `start`, `dev`, and `test` scripts |
| `package-lock.json` | Locked Node.js dependency versions |
| `.env.example` | Safe example environment configuration |
| `start_mrdu.bat` | Windows launcher that starts/checks the Node.js and WSL2 Kokoro services and opens the browser when both are ready |
| `.gitignore` | Excludes environment files, dependencies, Python caches, audio files, and logs |

## API Endpoints

### `GET /api/health`

Returns a small health response from the Express server, including whether an OpenRouter key is configured.

### `POST /api/chat`

Accepts the conversation contents and optional system instruction used by the browser. The backend converts the request to the OpenRouter chat-completions format and returns the mapped assistant response. The optional `tools` value can request OpenRouter web search; otherwise the backend's narrow detector may enable it for relevant current-information questions.

### `POST /api/tts`

Accepts text and optional `voice` and `speed` values. The Express server forwards the request to the local Kokoro `/tts` endpoint and returns the generated `audio/wav` response.

The local Kokoro service also exposes:

- `GET /health`
- `POST /tts`

These endpoints are provided by `kokoro_server.py` on `http://127.0.0.1:5001`.

## Installation

### Node.js application

Install Node.js 18 or later, then from the repository root run:

```powershell
npm install
```

Create a local `.env` file from `.env.example` and set the OpenRouter values:

```dotenv
PORT=3000
OPENROUTER_API_KEY=your_api_key_here
OPENROUTER_MODEL=openrouter/free
KOKORO_TTS_URL=http://127.0.0.1:5001/tts
```

The API key is read only by `server.js`; it is not intended for the browser.

### Kokoro service

Kokoro requires a working Python environment with the packages imported by `kokoro_server.py`: `fastapi`, `uvicorn`, `numpy`, `soundfile`, `pydantic`, and `kokoro`.

The repository does not include a Python dependency manifest. Set up those dependencies in the local Python environment you use for Kokoro, then start the service from the repository root:

```bash
python kokoro_server.py
```

For the supplied Windows launcher, the intended development setup is WSL2 with a project-local `.kokoro-venv-linux` environment. The launcher currently contains machine-specific Windows and WSL paths, so review those paths before using it on another computer.

## Running the Project

### Normal startup

From the repository root, install the Node.js dependencies:

```powershell
npm install
```

Start the local Kokoro service in one terminal:

```powershell
python kokoro_server.py
```

In another terminal, start the Node.js/Express application:

```powershell
npm run dev
```

Then open:

<http://localhost:3000>

The chatbot can answer text questions without Kokoro. Voice output through `/api/tts` requires the local Kokoro service. On first startup, Kokoro may take time to initialize because its AI model is loaded into memory.

### One-click Windows launcher

Run the following file from Windows:

```text
start_mrdu.bat
```

It checks ports `3000` and `5001`, starts Node.js and Kokoro through WSL2 when needed, waits for both services, and opens <http://localhost:3000>. Its paths are specific to the original development setup, so they may need adjustment on another computer.

## Testing

Run the repository's Node.js test suite with:

```powershell
npm test
```

The current verified result is **27 tests passed, 0 failed**. The suite covers wake-word matching and normalization, interim/final voice behavior, meaningful-transcript filtering, voice-session continuity, and web-search decision rules.

## Security

- Store `OPENROUTER_API_KEY` in the local `.env` file.
- Never commit `.env` or place the real key in frontend JavaScript.
- `.env.example` contains only placeholder configuration and is safe to share.
- Do not commit `node_modules`, local Python virtual environments, Python caches, generated WAV files, or logs.
- The backend keeps the OpenRouter authorization header on the server side.

## Current Status

| Feature | Status |
| --- | --- |
| Text chat UI | Implemented |
| OpenRouter chat integration | Implemented |
| Server-side API-key handling | Implemented |
| `/api/health`, `/api/chat`, and `/api/tts` | Implemented |
| “Hey MRDU” wake-word assistant | Implemented |
| Controlled wake-word normalization and matching | Implemented and tested |
| Same-sentence wake-word questions | Implemented and tested |
| Browser speech recognition | Implemented where the browser supports the Web Speech API |
| Local Kokoro WAV speech output | Implemented; requires the local Kokoro service |
| Narrow automatic current-information web-search decision | Implemented and tested |
| Manual Live Web Search control | Implemented |
| Quick Ask buttons and chat clearing | Implemented |
| Conversation persistence across page reloads | Not implemented |
| User authentication and personalized student services | Not implemented |
| Production deployment | Not implemented |

## Limitations

- Browser voice features depend on Web Speech API support, microphone permissions, and browser behavior.
- Background noise, accents, pronunciation, and speech-recognition errors can affect wake-word and question detection.
- OpenRouter chat requests require internet access and a valid API key.
- Voice output depends on the locally running Kokoro service and its Python/WSL2 setup.
- Kokoro model initialization can be slow on first startup.
- Conversation state is held in the browser session and is not backed by a database or user account.
- University information, admissions details, fees, contacts, programmes, and facilities can change; users should verify important details on the official MRDU website.
- The current setup is local and development-oriented rather than a complete production deployment.

## Future Enhancements

Potential future work includes:

- More robust speech recognition and noise handling
- Better support for varied accents and noisy environments
- Database-backed conversation history
- Authentication and personalized student services
- Production deployment with operational monitoring
- More advanced web-search automation and source handling
- Richer multi-turn voice interaction

These are future possibilities, not claims about functionality currently implemented in this repository.

## Why This Project?

The project demonstrates how a college-information interface can combine:

- Centralized access to commonly requested information
- A conversational interface for students and visitors
- Voice accessibility through browser speech recognition and local speech output
- AI-assisted question answering
- Frontend, backend, AI-integration, and speech-technology development in one application

## Credits / Acknowledgements

- Malla Reddy Deemed to be University — the institution represented by the chatbot
- OpenRouter — AI model access and optional web-search tool integration
- Kokoro — local text-to-speech
- FastAPI and Uvicorn — local Python TTS service
- Express and Node.js — local backend and test runtime
- Web Speech API — browser speech recognition

Project development team names have not been specified in this repository.

## Important Links

- [Official MRDU website](https://mrdu.edu.in/)
- [About MRDU](https://mrdu.edu.in/about)
- [GitHub repository](https://github.com/sripadhvarma/Chatbot_for_College)

No separate official contact page is listed here because the repository does not independently verify one. Refer to the official MRDU website for current contact information.

## License

No license has currently been specified for this repository.
