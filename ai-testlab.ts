import crypto from 'node:crypto';
import type { TestSession } from './testlab.js';
import { continueTestSession } from './testlab.js';

const SYSTEM = `Sei Saudade, assistente virtuale telefonico di Saudade Viaggi. Rispondi in italiano naturale e molto conciso, come in una telefonata. Fai una domanda alla volta. Devi capire la richiesta, raccogliere solo i dati utili e non trasformare il dialogo in un interrogatorio. Non inventare mai prezzi, disponibilita, requisiti di ingresso, visti, vaccini o informazioni sanitarie. Se il cliente chiede un operatore, manifesta un reclamo, una emergenza, oppure la risposta richiede dati non disponibili, proponi escalation umana. Per richieste viaggio raccogli quando opportuno: nome, recapito, destinazione, periodo, durata, aeroporto di partenza, numero viaggiatori ed eta minori, preferenze struttura/trattamento, budget e flessibilita. Quando i dati essenziali sono sufficienti, conferma brevemente e indica che la richiesta verra passata a un consulente. Non chiedere dati di carta, password o documenti completi.`;

export type AiTurn = {
  reply: string;
  done: boolean;
  summary?: string;
  nextAction?: string;
  data?: Record<string, unknown>;
  mode: 'openai' | 'fallback';
};

function conversationText(session: TestSession, userMessage: string) {
  const recent = [...session.messages, { role: 'caller' as const, text: userMessage }].slice(-18);
  return recent.map(m => `${m.role === 'assistant' ? 'ASSISTENTE' : 'CLIENTE'}: ${m.text}`).join('\n');
}

export async function aiTestTurn(session: TestSession, userMessage: string): Promise<AiTurn> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    const updated = continueTestSession(structuredClone(session), userMessage);
    const lastMessage = updated.messages[updated.messages.length - 1];
    const last = lastMessage?.text || 'Come posso aiutarla?';
    return { reply: last, done: !!updated.done, summary: updated.summary, nextAction: updated.nextAction, data: updated.data, mode: 'fallback' };
  }

  const model = process.env.OPENAI_TEST_MODEL || 'gpt-5.6-luna';
  const body = {
    model,
    input: [
      { role: 'system', content: [{ type: 'input_text', text: SYSTEM }] },
      { role: 'user', content: [{ type: 'input_text', text: `Scenario: ${session.scenario}\n\nConversazione:\n${conversationText(session, userMessage)}\n\nRestituisci SOLO JSON valido con questa forma: {"reply":"...","done":false,"summary":"","nextAction":"","data":{}}. reply deve essere la prossima frase telefonica. done=true solo se richiesta completata o escalation. summary e nextAction solo quando utili. In data conserva i fatti strutturati gia emersi.` }] }
    ],
    max_output_tokens: 900,
    reasoning: { effort: 'low' }
  };

  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const detail = await r.text();
    throw new Error(`OpenAI ${r.status}: ${detail.slice(0, 300)}`);
  }
  const json:any = await r.json();
  const text = json.output_text || json.output?.flatMap((x:any)=>x.content||[]).find((x:any)=>x.type==='output_text')?.text || '';
  let parsed:any;
  try { parsed = JSON.parse(text); }
  catch {
    const m = text.match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : { reply: text || 'Mi descrive meglio la sua richiesta?', done: false, data: {} };
  }
  return {
    reply: String(parsed.reply || 'Mi descrive meglio la sua richiesta?'),
    done: !!parsed.done,
    summary: parsed.summary ? String(parsed.summary) : undefined,
    nextAction: parsed.nextAction ? String(parsed.nextAction) : undefined,
    data: parsed.data && typeof parsed.data === 'object' ? parsed.data : {},
    mode: 'openai'
  };
}

export function mergeAiTurn(session: TestSession, userMessage: string, turn: AiTurn): TestSession & { mode?: string; id?: string } {
  const next:any = structuredClone(session);
  next.id ||= crypto.randomUUID();
  next.messages.push({ role: 'caller', text: userMessage });
  next.messages.push({ role: 'assistant', text: turn.reply });
  next.data = { ...(next.data || {}), ...(turn.data || {}) };
  next.done = turn.done;
  if (turn.summary) next.summary = turn.summary;
  if (turn.nextAction) next.nextAction = turn.nextAction;
  next.mode = turn.mode;
  return next;
}
