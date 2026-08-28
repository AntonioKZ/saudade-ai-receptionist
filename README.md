# Saudade AI Receptionist — v0.5

MVP di risponditore telefonico AI per agenzia viaggi.

## Architettura

Telefono -> Twilio Voice / bidirectional Media Streams -> WebSocket Fastify -> OpenAI Realtime -> tool aziendali -> PostgreSQL.

L'audio è inoltrato in G.711 μ-law / PCMU per evitare transcoding: Twilio Media Streams usa audio/x-mulaw 8 kHz e OpenAI Realtime accetta audio/pcmu.

## Funzioni principali

- webhook `POST /voice/incoming` per Twilio;
- WebSocket bidirezionale `/voice/media`;
- conversazione speech-to-speech OpenAI Realtime;
- trascrizione cliente e assistente;
- storico chiamate, lead ed escalation;
- creazione lead e trasferimento a operatore;
- dashboard `/`;
- AI Conversation Test Lab con testo e voce browser;
- fallback locale senza API key;
- endpoint `/health`.

## Setup

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run dev
```

Variabili principali:

- `DATABASE_URL`
- `OPENAI_API_KEY`
- `PUBLIC_BASE_URL`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `OPERATOR_PHONE`

## Release 0.5 — AI Conversation Test Lab

- Conversazione libera via testo.
- Input vocale browser con Web Speech API quando supportata.
- Lettura vocale della risposta con `speechSynthesis`.
- Endpoint `/api/testlab/ai-message`.
- Modalità OpenAI quando `OPENAI_API_KEY` è configurata.
- Fallback locale deterministico senza chiave.
- Raccolta progressiva dei dati, summary e next action.
- Nessuna chiave API viene inviata al browser.

Variabili opzionali:

```env
OPENAI_TEST_MODEL=gpt-5.6-luna
```

## Sicurezza

Non inserire API key o credenziali nel repository. Configurare i secret esclusivamente nelle Environment Variables di Vercel.

<!-- deploy trigger 2026-08-29 -->
