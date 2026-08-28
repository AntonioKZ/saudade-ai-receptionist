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

const titleCase = (s: string) => s.trim().replace(/\s+/g, ' ').replace(/(^|\s)[a-zà-ÿ]/g, x => x.toUpperCase());
const isNo = (s: string) => /^(no|nessun|nessuno|non ci sono|senza)/i.test(s.trim());
const isYes = (s: string) => /^(s[iì]|certo|certamente|va bene|ok|confermo|corretto)/i.test(s.trim());

function extractDestination(text: string) {
  const s = text.replace(/[,.!?]/g, ' ').replace(/\s+/g, ' ');
  const patterns = [
    /(?:viaggio|vacanza|weekend|preventiv[oa]|prenotazione)\s+(?:per\s+)?(?:un\s+)?(?:viaggio\s+)?(?:a|ad|per|verso)\s+([A-Za-zÀ-ÿ' -]{2,40}?)(?=\s+(?:per|nel|nella|durante|a\s+natale|di\s+natale|una\s+settimana|\d+\s+giorni)\b|$)/i,
    /(?:a|ad|verso)\s+([A-Za-zÀ-ÿ' -]{2,40}?)(?=\s+(?:per|nel|nella|durante)\b|$)/i
  ];
  for (const p of patterns) {
    const m = s.match(p);
    if (m?.[1]) {
      const raw = m[1].trim().replace(/^(un|una)\s+viaggio\s+/i, '');
      if (!/^(un|una|viaggio|vacanza|settimana|giorni?)$/i.test(raw)) return titleCase(raw);
    }
  }
  return undefined;
}

function extractPeriod(text: string) {
  const l = text.toLowerCase();
  const known: Array<[string,string]> = [
    ['natale','periodo di Natale'],['capodanno','Capodanno'],['pasqua','Pasqua'],['estate','estate'],
    ['gennaio','gennaio'],['febbraio','febbraio'],['marzo','marzo'],['aprile','aprile'],['maggio','maggio'],['giugno','giugno'],
    ['luglio','luglio'],['agosto','agosto'],['settembre','settembre'],['ottobre','ottobre'],['novembre','novembre'],['dicembre','dicembre']
  ];
  for (const [n,v] of known) if (l.includes(n)) return v;
  const m = text.match(/\b(\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?)\b/);
  return m?.[1];
}

function extractDuration(text: string) {
  const l = text.toLowerCase();
  if (/\buna settimana\b|\b1 settimana\b/.test(l)) return '7 giorni';
  if (/\bdue settimane\b|\b2 settimane\b/.test(l)) return '14 giorni';
  const m = l.match(/\b(\d{1,2}|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|undici|dodici|tredici|quattordici)\s+giorn[oi]\b/i);
  return m?.[0];
}

function extractDeparture(text: string) {
  const m = text.match(/(?:part(?:ire|enza)|volo|aereo)\s+(?:da|dall[ae']?)\s+([A-Za-zÀ-ÿ' -]{2,35})/i)
    || text.match(/(?:da|dall[ae']?)\s+(Catania|Palermo|Roma|Milano|Napoli|Bologna|Torino|Venezia|Pisa|Firenze)\b/i);
  return m?.[1] ? titleCase(m[1]) : undefined;
}

function extractTravelers(text: string) {
  const m = text.match(/\b(\d+|uno|una|due|tre|quattro|cinque|sei|sette|otto)\s+(?:persone|adulti|viaggiatori|pax)\b/i);
  return m?.[0];
}

function extractChildren(text: string) {
  const l = text.toLowerCase();
  if (/senza bambini|nessun bambino|nessun ragazzo|solo adulti/.test(l)) return 'Nessuno';
  const m = text.match(/(\d+|uno|una|due|tre|quattro)\s+(?:bambin[oi]|ragazz[oi])(?:[^.]{0,30})?/i);
  return m?.[0];
}

function extractBudget(text: string) {
  const m = text.match(/(?:budget|massimo|max|spendere|spesa)[^\d]{0,20}(\d{3,6})(?:\s*€|\s*euro)?/i)
    || text.match(/\b(\d{3,6})\s*(?:€|euro)\b/i);
  return m?.[1] ? `${m[1]} €` : undefined;
}

function absorb(session: TestSession, text: string) {
  const d = session.data;
  d.destination ||= extractDestination(text);
  d.period ||= extractPeriod(text);
  d.duration ||= extractDuration(text);
  d.departure_airport ||= extractDeparture(text);
  d.travelers ||= extractTravelers(text);
  d.children ||= extractChildren(text);
  d.budget ||= extractBudget(text);
  if (/flessibil|sto valutando|non ho date precise|indicativ|circa/.test(text.toLowerCase())) d.period_flexible = true;
}

function nextMissingQuestion(d: Record<string, any>) {
  if (!d.destination) return 'Per quale destinazione desidera ricevere il preventivo?';
  if (!d.period) return `Perfetto, ${d.destination}. Ha già in mente un periodo o delle date indicative?`;
  if (!d.duration) return `Perfetto, ${d.destination} nel ${d.period}. Quanti giorni vorrebbe rimanere?`;
  if (!d.departure_airport) return `Perfetto, ${d.duration}. Da quale aeroporto o città preferirebbe partire?`;
  if (!d.travelers) return 'Quante persone viaggerebbero?';
  if (!d.children) return 'Ci sono bambini o ragazzi? Se sì, mi dica anche l’età prevista alla data del viaggio.';
  if (!d.hotel_preferences) return `Per ${d.destination}, che tipo di sistemazione preferisce? Hotel, B&B, appartamento o altro?`;
  if (!d.budget) return 'Ha un budget indicativo complessivo? Se non lo ha ancora definito possiamo lasciarlo aperto.';
  if (!d.other_preferences) return 'Ci sono altre preferenze importanti, ad esempio posizione centrale, colazione inclusa o volo diretto?';
  return null;
}

function travelReply(session: TestSession, input: string) {
  const t = input.trim();
  const l = t.toLowerCase();
  if (/operatore|persona|qualcuno dell.?agenzia/.test(l)) {
    session.done = true; session.nextAction = 'Trasferire a operatore; se non disponibile, creare callback.';
    return 'Certamente. Provo a trasferirla a un operatore; se non fosse disponibile registro già la richiesta.';
  }
  if (/reclam|lament|problema con una prenotazione/.test(l)) {
    session.done = true; session.nextAction = 'Escalation prioritaria a operatore umano.';
    return 'Capisco. Per un reclamo preferisco coinvolgere subito un operatore e registro il motivo della chiamata.';
  }

  const before = { ...session.data };
  absorb(session, t);
  const d = session.data;

  const expected = nextMissingQuestion(before);
  if (expected?.includes('sistemazione') && !d.hotel_preferences && !extractDestination(t) && !extractPeriod(t) && !extractDuration(t)) d.hotel_preferences = t;
  else if (expected?.includes('budget') && !d.budget) d.budget = /non.*budget|non.*definit/i.test(l) ? 'Da definire' : (extractBudget(t) || t);
  else if (expected?.includes('altre preferenze') && !d.other_preferences) d.other_preferences = isNo(t) ? 'Nessuna' : t;
  else if (expected?.includes('persone') && !d.travelers) d.travelers = t;
  else if (expected?.includes('bambini') && !d.children) d.children = isNo(t) ? 'Nessuno' : t;
  else if (expected?.includes('aeroporto') && !d.departure_airport) d.departure_airport = titleCase(t.replace(/^(da|partirei da|preferirei)\s+/i,''));
  else if (expected?.includes('Quanti giorni') && !d.duration) d.duration = extractDuration(t) || t;
  else if (expected?.includes('periodo') && !d.period) d.period = extractPeriod(t) || (/non so|sto valutando/i.test(l) ? 'Da definire' : t);
  else if (expected?.includes('destinazione') && !d.destination) d.destination = extractDestination(t) || titleCase(t.replace(/^(a|ad|per)\s+/i,''));

  const q = nextMissingQuestion(d);
  if (q) return q;

  if (!d.confirmation_requested) {
    d.confirmation_requested = true;
    return `Riassumo: ${d.destination}, ${d.period}${d.period_flexible ? ' con date flessibili' : ''}, ${d.duration}, partenza da ${d.departure_airport}, ${d.travelers}, bambini/ragazzi ${d.children}, sistemazione ${d.hotel_preferences}, budget ${d.budget}. È corretto?`;
  }

  if (!d.confirmed) {
    if (/no|sbagli|corregg/.test(l)) return 'Va bene. Mi dica direttamente quale dato vuole correggere e con quale valore.';
    if (isYes(t) || !/no/.test(l)) { d.confirmed = true; return 'Perfetto. Mi dice il suo nome per inoltrare la richiesta al consulente?'; }
  }

  if (!d.name) {
    d.name = t.replace(/^(mi chiamo|sono)\s+/i,'').trim();
    return 'Posso utilizzare il numero da cui sta chiamando per essere ricontattato sulla richiesta?';
  }

  d.contact_ok = !/no/.test(l);
  session.done = true;
  session.nextAction = 'Creare lead e assegnare a consulente viaggi; verificare disponibilità, prezzi e condizioni reali.';
  session.summary = buildSummary(session);
  return 'Perfetto. Ho raccolto la richiesta e la inoltro al consulente, che verificherà disponibilità e prezzi reali prima di ricontattarla.';
}

function genericReply(session: TestSession, input: string) {
  if (session.scenario === 'human_operator') {
    session.done = true; session.nextAction = 'Trasferire a operatore / creare callback.'; session.summary = `Richiesta operatore: ${input}`;
    return 'Certamente. Provo a trasferirla a un operatore; se non fosse disponibile registro un callback.';
  }
  if (session.scenario === 'complaint') {
    session.done = true; session.nextAction = 'Escalation prioritaria a operatore umano.'; session.summary = `Reclamo cliente: ${input}`;
    return 'Capisco. Trattandosi di un reclamo preferisco farla assistere da un operatore e registro il motivo.';
  }
  return travelReply(session, input);
}

export function continueTestSession(session: TestSession, input: string): TestSession {
  const clean = input.trim();
  if (!clean || session.done) return session;
  session.messages.push({ role: 'caller', text: clean });
  session.messages.push({ role: 'assistant', text: genericReply(session, clean) });
  if (session.done && !session.summary) session.summary = buildSummary(session);
  return session;
}

function buildSummary(session: TestSession) {
  const d = session.data;
  return [
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
  ].filter(Boolean).join('\n') || 'Simulazione completata.';
}
