export type TestSession = {
  scenario: string;
  step: number;
  data: Record<string, any>;
  messages: Array<{ role: 'assistant'|'caller'; text: string }>;
  done?: boolean;
  summary?: string;
  nextAction?: string;
};

const scenarios = {
  zanzibar_quote: {
    title: 'Nuovo preventivo Zanzibar',
    opening: 'Buongiorno, ha chiamato Saudade Viaggi. Sono l’assistente virtuale dell’agenzia. Come posso aiutarla?'
  },
  human_operator: {
    title: 'Richiesta operatore',
    opening: 'Buongiorno, ha chiamato Saudade Viaggi. Sono l’assistente virtuale dell’agenzia. Come posso aiutarla?'
  },
  complaint: {
    title: 'Reclamo',
    opening: 'Buongiorno, ha chiamato Saudade Viaggi. Sono l’assistente virtuale dell’agenzia. Come posso aiutarla?'
  }
} as const;

export function listTestScenarios() {
  return Object.entries(scenarios).map(([id, s]) => ({ id, title: s.title }));
}

export function startTestSession(scenario = 'zanzibar_quote'): TestSession {
  const selected = scenarios[scenario as keyof typeof scenarios] || scenarios.zanzibar_quote;
  return {
    scenario,
    step: 0,
    data: {},
    messages: [{ role: 'assistant', text: selected.opening }]
  };
}

function extract(text: string, patterns: RegExp[]) {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return (m[1] || m[0]).trim();
  }
  return undefined;
}

function zanzibarReply(session: TestSession, input: string) {
  const t = input.trim();
  const l = t.toLowerCase();
  if (/operatore|persona|qualcuno dell.?agenzia/.test(l)) {
    session.done = true;
    session.nextAction = 'Trasferire a operatore; se non disponibile, creare callback.';
    return 'Certamente. Posso provare a trasferirla a un operatore. Se nessuno fosse disponibile, lascio la richiesta già raccolta così non dovrà ripetere tutto.';
  }
  if (/vaccin|profilassi/.test(l)) {
    session.data.health_question = true;
    return 'Posso darle solo informazioni generali. Per vaccinazioni e profilassi è opportuno verificare fonti ufficiali aggiornate e un centro di medicina dei viaggi. Aggiungo la domanda alla richiesta.';
  }
  if (/passaport|visto|document/.test(l)) {
    session.data.documents_question = true;
    return 'È un requisito che preferisco verificare su fonti ufficiali aggiornate prima di darle una risposta definitiva. Lo aggiungo alla richiesta.';
  }
  if (/quanto|prezzo|costa|4000|4\.000/.test(l) && session.step >= 5) {
    return 'Preferisco non indicarle un prezzo non verificato. Tariffe e disponibilità cambiano; posso registrare il budget e far verificare una proposta reale dal consulente.';
  }

  switch (session.step) {
    case 0:
      session.data.destination = /zanzibar/.test(l) ? 'Zanzibar' : t;
      session.step = 1;
      return 'Certamente. Ha già in mente un periodo oppure sta ancora valutando?';
    case 1:
      session.data.period = t;
      session.step = 2;
      return 'Perfetto. Indicativamente quanti giorni vorreste rimanere?';
    case 2:
      session.data.duration = t;
      session.step = 3;
      return 'Va bene. Da quale aeroporto preferireste partire?';
    case 3:
      session.data.departure_airport = /catania/.test(l) ? 'Catania' : t;
      session.data.direct_flight = /dirett/.test(l);
      session.step = 4;
      return 'Ricevuto. Quante persone viaggerebbero?';
    case 4:
      session.data.travelers = t;
      session.step = 5;
      return 'Perfetto. Ci sono bambini o ragazzi? Se sì, quanti anni avranno alla data del viaggio?';
    case 5:
      session.data.children = t;
      session.step = 6;
      return 'Avete già una zona preferita di Zanzibar oppure volete un consiglio dell’agenzia?';
    case 6:
      session.data.area = /nungwi/.test(l) ? 'Nungwi' : t;
      session.step = 7;
      return 'Per la struttura cercate soprattutto un resort sul mare? Avete una preferenza per il trattamento?';
    case 7:
      session.data.hotel_preferences = t;
      session.step = 8;
      return 'Avete un budget indicativo complessivo?';
    case 8:
      session.data.budget = t;
      session.step = 9;
      return 'Perfetto. Il budget è un limite rigido oppure possiamo valutare qualcosa in più se offre un vantaggio significativo?';
    case 9:
      session.data.budget_flexibility = t;
      session.step = 10;
      return `Riassumo: ${session.data.destination || 'Zanzibar'}, ${session.data.period}, ${session.data.duration}, partenza da ${session.data.departure_airport}, ${session.data.travelers}, zona ${session.data.area}, preferenze ${session.data.hotel_preferences}, budget ${session.data.budget}. È corretto?`;
    case 10:
      session.data.confirmed = !/no|sbagli/.test(l);
      session.step = 11;
      return 'Perfetto. Per preparare la richiesta mi servono il suo nome e un recapito. Se sta simulando, può usare dati fittizi.';
    case 11:
      session.data.name = extract(t, [/mi chiamo\s+(.+)/i, /sono\s+(.+)/i]) || t;
      session.step = 12;
      return 'Posso utilizzare il numero da cui sta chiamando per essere ricontattato sulla richiesta?';
    case 12:
      session.data.contact_ok = !/no/.test(l);
      session.done = true;
      session.nextAction = 'Creare lead e assegnare a consulente viaggi; verificare disponibilità e prezzo reale.';
      session.summary = buildSummary(session);
      return 'Perfetto. La richiesta è completa e la inoltro al consulente. Non inventerò prezzi o disponibilità: saranno verificati sui sistemi reali.';
    default:
      session.done = true;
      session.summary = buildSummary(session);
      return 'La simulazione è completata.';
  }
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
  return zanzibarReply(session, input);
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
    d.period && `Periodo: ${d.period}`,
    d.duration && `Durata: ${d.duration}`,
    d.departure_airport && `Partenza: ${d.departure_airport}`,
    d.travelers && `Viaggiatori: ${d.travelers}`,
    d.children && `Bambini/ragazzi: ${d.children}`,
    d.area && `Zona: ${d.area}`,
    d.hotel_preferences && `Preferenze struttura: ${d.hotel_preferences}`,
    d.budget && `Budget: ${d.budget}`,
    d.health_question && 'Da verificare: informazioni sanitarie',
    d.documents_question && 'Da verificare: documenti/requisiti ingresso'
  ].filter(Boolean);
  return rows.join('\n') || 'Simulazione completata.';
}
