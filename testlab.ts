export type TestSession = {
  scenario: string;
  step: number;
  data: Record<string, any>;
  messages: Array<{ role: 'assistant'|'caller'; text: string }>;
  done?: boolean;
  summary?: string;
  nextAction?: string;
};

const opening = 'Buongiorno, ha chiamato Saudade Viaggi. Sono l’assistente virtuale dell’agenzia. Come posso aiutarla?';

const scenarios = {
  zanzibar_quote: { title: 'Nuovo preventivo viaggio', opening },
  human_operator: { title: 'Richiesta operatore', opening },
  complaint: { title: 'Reclamo', opening }
} as const;

export function listTestScenarios() {
  return Object.entries(scenarios).map(([id, s]) => ({ id, title: s.title }));
}

export function startTestSession(scenario = 'zanzibar_quote'): TestSession {
  const selected = scenarios[scenario as keyof typeof scenarios] || scenarios.zanzibar_quote;
  return { scenario, step: 0, data: {}, messages: [{ role: 'assistant', text: selected.opening }] };
}

function extract(text: string, patterns: RegExp[]) {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return (m[1] || m[0]).trim();
  }
  return undefined;
}

function titleCase(s: string) {
  return s.trim().replace(/\s+/g, ' ').replace(/(^|\s)[a-zà-ÿ]/g, x => x.toUpperCase());
}

function extractDestination(text: string) {
  const cleaned = text.replace(/[,.!?]/g, ' ');
  const m = cleaned.match(/(?:viaggio|vacanza|preventiv[oi]|andare|partire|volo|weekend)\s+(?:per|a|ad|verso)\s+([A-Za-zÀ-ÿ' -]{2,40})/i)
    || cleaned.match(/(?:per|a|ad|verso)\s+([A-Za-zÀ-ÿ' -]{2,40})$/i);
  if (!m) return undefined;
  const raw = m[1].replace(/\b(?:nel|nella|durante|per|a|ad)\b.*$/i, '').trim();
  if (/^(una?|sette|7|settimana|giorn[oi]|natale|capodanno|estate|agosto|luglio)$/i.test(raw)) return undefined;
  return titleCase(raw);
}

function extractPeriod(text: string) {
  const l = text.toLowerCase();
  const known = [
    ['natale', 'periodo di Natale'], ['capodanno', 'Capodanno'], ['pasqua', 'Pasqua'],
    ['estate', 'estate'], ['agosto', 'agosto'], ['luglio', 'luglio'], ['giugno', 'giugno'],
    ['settembre', 'settembre'], ['ottobre', 'ottobre'], ['novembre', 'novembre'], ['dicembre', 'dicembre'],
    ['gennaio', 'gennaio'], ['febbraio', 'febbraio'], ['marzo', 'marzo'], ['aprile', 'aprile'], ['maggio', 'maggio']
  ] as const;
  for (const [needle, value] of known) if (l.includes(needle)) return value;
  const date = text.match(/\b(?:dal|il|intorno al|verso il)?\s*(\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?)\b/i);
  return date?.[1];
}

function extractDuration(text: string) {
  const l = text.toLowerCase().trim();
  if (/una settimana|1 settimana/.test(l)) return '7 giorni';
  if (/due settimane|2 settimane/.test(l)) return '14 giorni';
  const days = l.match(/\b(\d{1,2}|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|undici|dodici|tredici|quattordici)\s+giorn[oi]\b/i);
  if (days) return days[0];
  return text.trim();
}

function isFlexible(text: string) {
  return /sto ancora valutando|ancora valutando|non ho.*periodo|non so ancora|flessibil|indicativ|più o meno|circa/.test(text.toLowerCase());
}

function isNo(text: string) { return /^(no|nessun|nessuno|non ci sono)/i.test(text.trim()); }
function isYes(text: string) { return /^(s[iì]|certo|certamente|va bene|ok|confermo)/i.test(text.trim()); }

function travelReply(session: TestSession, input: string) {
  const t = input.trim();
  const l = t.toLowerCase();

  if (/operatore|persona|qualcuno dell.?agenzia/.test(l)) {
    session.done = true;
    session.nextAction = 'Trasferire a operatore; se non disponibile, creare callback.';
    return 'Certamente. Posso provare a trasferirla a un operatore. Se nessuno fosse disponibile, registro la richiesta così non dovrà ripetere tutto.';
  }
  if (/reclam|lament|problema con una prenotazione/.test(l)) {
    session.done = true;
    session.nextAction = 'Escalation prioritaria a operatore umano.';
    return 'Capisco. Per un reclamo preferisco coinvolgere subito un operatore. Registro il motivo e richiedo una presa in carico prioritaria.';
  }

  if (session.step === 0) {
    session.data.destination ||= extractDestination(t) || (/zanzibar/.test(l) ? 'Zanzibar' : undefined);
    const p = extractPeriod(t);
    if (p && !session.data.period) session.data.period = p;
    if (isFlexible(t)) session.data.period_flexible = true;

    if (!session.data.destination) return 'Certamente. Per quale destinazione desidera ricevere un preventivo?';
    if (session.data.period) {
      session.step = 2;
      return `Perfetto, ${session.data.destination} nel ${session.data.period}. Indicativamente quanti giorni vorrebbe rimanere?`;
    }
    session.step = 1;
    return `Perfetto, ${session.data.destination}. Ha già in mente un periodo oppure sta ancora valutando?`;
  }

  if (session.step === 1) {
    const p = extractPeriod(t);
    if (p) session.data.period = p;
    if (isFlexible(t)) session.data.period_flexible = true;
    if (!session.data.period) session.data.period = isFlexible(t) ? 'da definire' : t;
    session.step = 2;
    return `Va bene, considero ${session.data.period}${session.data.period_flexible ? ' con date ancora flessibili' : ''}. Indicativamente quanti giorni vorrebbe rimanere?`;
  }

  if (session.step === 2) {
    session.data.duration = extractDuration(t);
    session.step = 3;
    return `Perfetto, ${session.data.duration}. Da quale aeroporto o città preferirebbe partire?`;
  }

  if (session.step === 3) {
    session.data.departure_airport = titleCase(t.replace(/^(da|partirei da|preferirei)\s+/i, ''));
    session.step = 4;
    return 'Quante persone viaggerebbero?';
  }

  if (session.step === 4) {
    session.data.travelers = t;
    session.step = 5;
    return 'Ci sono bambini o ragazzi? Se sì, mi dica anche l’età prevista alla data del viaggio.';
  }

  if (session.step === 5) {
    session.data.children = isNo(t) ? 'Nessuno' : t;
    session.step = 6;
    return `Per ${session.data.destination}, che tipo di sistemazione preferisce? Ad esempio hotel, B&B o appartamento.`;
  }

  if (session.step === 6) {
    session.data.hotel_preferences = t;
    session.step = 7;
    return 'Ha un budget indicativo complessivo per il viaggio? Se non lo ha ancora definito possiamo lasciarlo aperto.';
  }

  if (session.step === 7) {
    session.data.budget = t;
    session.step = 8;
    return 'Ci sono altre preferenze importanti? Per esempio posizione centrale, colazione inclusa o particolari esigenze.';
  }

  if (session.step === 8) {
    session.data.other_preferences = t;
    session.step = 9;
    return `Riassumo: destinazione ${session.data.destination}, periodo ${session.data.period}${session.data.period_flexible ? ' flessibile' : ''}, durata ${session.data.duration}, partenza da ${session.data.departure_airport}, viaggiatori ${session.data.travelers}, sistemazione ${session.data.hotel_preferences}, budget ${session.data.budget}. È corretto?`;
  }

  if (session.step === 9) {
    if (!isYes(t) && /no|sbagli|corregg/.test(l)) {
      return 'Va bene. Mi dica quale dato vuole correggere: destinazione, periodo, durata, partenza, viaggiatori, sistemazione o budget.';
    }
    session.data.confirmed = true;
    session.step = 10;
    return 'Perfetto. Per inoltrare la richiesta al consulente mi serve il suo nome. In questa simulazione può usare anche un nome fittizio.';
  }

  if (session.step === 10) {
    session.data.name = extract(t, [/mi chiamo\s+(.+)/i, /sono\s+(.+)/i]) || t;
    session.step = 11;
    return 'Posso utilizzare il numero da cui sta chiamando per essere ricontattato sulla richiesta?';
  }

  if (session.step === 11) {
    session.data.contact_ok = !/no/.test(l);
    session.done = true;
    session.nextAction = 'Creare lead e assegnare a consulente viaggi; verificare disponibilità, prezzi e condizioni reali.';
    session.summary = buildSummary(session);
    return 'Perfetto. Ho raccolto la richiesta e la inoltro al consulente, che verificherà disponibilità e prezzi reali prima di ricontattarla.';
  }

  session.done = true;
  session.summary = buildSummary(session);
  return 'La simulazione è completata.';
}

function genericReply(session: TestSession, input: string) {
  if (session.scenario === 'human_operator') {
    session.done = true;
    session.nextAction = 'Trasferire a operatore / creare callback.';
    session.summary = `Richiesta operatore. Motivo espresso dal cliente: ${input}`;
    return 'Certamente. Provo a trasferirla a un operatore. Se non fosse disponibile, registro un callback così non dovrà richiamare.';
  }
  if (session.scenario === 'complaint') {
    session.done = true;
    session.nextAction = 'Escalation prioritaria a operatore umano.';
    session.summary = `Reclamo cliente: ${input}`;
    return 'Capisco. Trattandosi di un reclamo preferisco farla assistere da un operatore. Registro il motivo e richiedo una presa in carico prioritaria.';
  }
  return travelReply(session, input);
}

export function continueTestSession(session: TestSession, input: string): TestSession {
  const clean = input.trim();
  if (!clean || session.done) return session;
  session.messages.push({ role: 'caller', text: clean });
  const reply = genericReply(session, clean);
  session.messages.push({ role: 'assistant', text: reply });
  if (session.done && !session.summary) session.summary = buildSummary(session);
  return session;
}

function buildSummary(session: TestSession) {
  const d = session.data;
  const rows = [
    d.name && `Cliente: ${d.name}`,
    d.destination && `Destinazione: ${d.destination}`,
    d.period && `Periodo: ${d.period}${d.period_flexible ? ' (flessibile)' : ''}`,
    d.duration && `Durata: ${d.duration}`,
    d.departure_airport && `Partenza: ${d.departure_airport}`,
    d.travelers && `Viaggiatori: ${d.travelers}`,
    d.children && `Bambini/ragazzi: ${d.children}`,
    d.hotel_preferences && `Sistemazione: ${d.hotel_preferences}`,
    d.budget && `Budget: ${d.budget}`,
    d.other_preferences && `Altre preferenze: ${d.other_preferences}`
  ].filter(Boolean);
  return rows.join('\n') || 'Simulazione completata.';
}
