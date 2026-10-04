'use strict';
// Mocked-boundary integration scenarios through Georgia's own runtime entry
// points (the same composition instagram-agent.js uses). Real modules from the
// isolated snapshot: routing/ownership, V2 Direct runtime/adapter/builder,
// catalog selection, discovery/exact pricing, money renderer/output guard,
// SQLite claims and delivery states, CRM mirror records, Comments runtime and
// its no-money guard. Mocked only: model, Graph send, supplier quote gateway,
// collector XLSX row source, conversation resolution and CRM transport.
// Any network/subprocess capability or filesystem read outside the snapshot,
// the disposable work dir and the pinned SQLite binding is blocked and makes
// the run an infrastructure error (exit 2), never a pass.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const [srcArg, workArg, nativeArg, casesFile] = process.argv.slice(2);
const SRC = path.resolve(srcArg);
const WORK = path.resolve(workArg);
const NATIVE = path.resolve(nativeArg, 'node_modules');
const HERE = __dirname;
const blocked = [];
const CASES = JSON.parse(fs.readFileSync(casesFile, 'utf8'));
const { runHardInvariant } = require('./hard-invariants.cjs');

const inside = (p, dir) => p === dir || p.startsWith(dir.endsWith(path.sep) ? dir : dir + path.sep);
const ALLOWED = [SRC, WORK, NATIVE, HERE];
for (const method of ['readFileSync', 'statSync', 'existsSync', 'openSync', 'readdirSync', 'realpathSync', 'accessSync', 'lstatSync']) {
  const original = fs[method];
  fs[method] = function guarded(target, ...args) {
    if (typeof target === 'string' || target instanceof URL) {
      const resolved = path.resolve(target instanceof URL ? target.pathname : target);
      const ancestor = method === 'lstatSync' && ALLOWED.some(dir => inside(dir, resolved));
      if (!ancestor && !ALLOWED.some(dir => inside(resolved, dir))) {
        blocked.push(`fs.${method}:${resolved}`);
        const error = new Error('FS_OUTSIDE_SANDBOX_BLOCKED');
        error.code = 'ENOENT';
        throw error;
      }
    }
    return original.call(this, target, ...args);
  };
}
const DENIED = new Set(['child_process', 'net', 'dns', 'http', 'https', 'http2', 'tls', 'dgram', 'worker_threads', 'cluster', 'inspector']);
const load = Module._load;
Module._load = function guardedLoad(request, parent, isMain) {
  if (request === 'better-sqlite3') return load.call(this, path.join(NATIVE, 'better-sqlite3'), parent, isMain);
  const name = String(request).replace(/^node:/, '');
  if (DENIED.has(name)) {
    return new Proxy({}, { get: (_, key) => (key === '__esModule' ? false : () => { blocked.push(`${name}.${String(key)}`); throw new Error(`EXTERNAL_CALL_BLOCKED:${name}`); }) });
  }
  return load.call(this, request, parent, isMain);
};
globalThis.fetch = async () => { blocked.push('fetch'); throw new Error('EXTERNAL_CALL_BLOCKED:fetch'); };

const src = rel => require(path.join(SRC, rel));
const { createGeorgiaDirectRuntime } = src('instagram-v2/runtime/direct-runtime');
const { createDirectCatalogProvider, rebindHybridCard } = src('instagram-v2/providers/tripster-hybrid-catalog-provider');
const { createDirectKnowledgeProvider } = src('instagram-v2/integration/direct-knowledge-provider');
const { buildDirectCrmMirrorRecord, buildDirectInboundCrmMirrorRecord, buildDirectStatusCrmMirrorRecord } = src('instagram-v2/integration/direct-crm-mirror-record');
const { quoteOnDemand } = src('georgia-on-demand-quote');
const { processDirectAtV2Boundary } = src('instagram-v2/integration/direct-entrypoint');
const { runDirectOwnership } = src('instagram-v2/integration/ownership');
const { createGeorgiaCommentsRuntime } = src('instagram-v2/runtime/comments-runtime');

const ACCOUNT = 'synthetic_account';
const USERNAME = 'georgiaforyou';
const CONVERSATION = 'synthetic_conversation';
const CUSTOMER = 'synthetic_customer';
const PRODUCT = 42;
const TITLE = 'Синтетическая Кахетия';
const DIRECT_ENV = Object.freeze({ IG_GEORGIA_V2_ENABLED: 'true', IG_GEORGIA_STATE_V2_ENABLED: 'true', IG_GEORGIA_DIRECT_V2_ENABLED: 'true', IG_GEORGIA_V2_FULL_ROLLOUT: 'true', IG_GEORGIA_FALLBACK_ENABLED: 'false' });
const COMMENTS_ENV = Object.freeze({ IG_GEORGIA_V2_ENABLED: 'true', IG_GEORGIA_STATE_V2_ENABLED: 'true', IG_GEORGIA_COMMENTS_V2_ENABLED: 'true', IG_GEORGIA_COMMENTS_WEBHOOK_V2_ENABLED: 'true', IG_GEORGIA_COMMENTS_V2_SEND_ENABLED: 'true', IG_GEORGIA_V2_FULL_ROLLOUT: 'true' });
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

// Independent customer-visible money detector (not Georgia's guard): every
// amount with a currency marker on either side, plus bare currency words.
function moneyTokens(text) {
  const value = String(text || '');
  const tokens = [];
  const currency = { '$': 'USD', usd: 'USD', 'долл': 'USD', '€': 'EUR', eur: 'EUR', 'евро': 'EUR', '₾': 'GEL', gel: 'GEL', 'лари': 'GEL', '₽': 'RUB', 'руб': 'RUB' };
  const marker = '(\\$|€|₾|₽|usd|eur|gel|долл[а-я]*|евро|лари|руб[а-я]*)';
  const amount = '(\\d+(?:[.,]\\d{1,2})?)';
  const re = new RegExp(`${marker}\\s*${amount}|${amount}\\s*${marker}`, 'giu');
  for (const m of value.matchAll(re)) {
    const mark = String(m[1] || m[4]).toLowerCase();
    const key = Object.keys(currency).find(k => mark.startsWith(k));
    tokens.push({ amount: String(m[2] || m[3]).replace(',', '.'), currency: currency[key] });
  }
  return tokens;
}
const percentPresent = text => /\d+\s*%/.test(String(text || ''));

function isoAgo(ms) { return new Date(Date.now() - ms).toISOString(); }
const isoSecondsAgo = ms => isoAgo(ms).replace(/\.\d{3}Z$/, 'Z');
function futureOrder(days = 30) {
  const d = new Date(Date.now() + days * 86400000);
  return { datesText: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`, date: d.toISOString().slice(0, 10) };
}
// Synthetic collector authority row (what the XLSX authority reader returns).
function authorityRow(overrides = {}) {
  const at = isoAgo(3600000);
  return {
    product_id: String(PRODUCT), supplier_product_id: String(PRODUCT), title: TITLE, format: 'group', fresh: true, kind: 'excursion',
    pricing_schema_version: '1', supplier: 'Tripster', quote_scope_id: `${PRODUCT}:PER_PERSON`, price_basis: 'PER_PERSON', price_for: 'за человека',
    pricing_model: 'fixed', currency: 'USD', source_price: '90.00', price_verified: 'true', price_verified_at: at, price_evidence_ref: `tripster:${PRODUCT}:price`,
    description: 'Винодельни и монастырь', duration: '8 часов', included: 'гид', ...overrides
  };
}
function eurGroupRow() {
  const at = isoAgo(3600000);
  return authorityRow({ currency: 'EUR', source_price: '210.00', price_basis: 'PER_GROUP', quote_scope_id: `${PRODUCT}:PER_GROUP`, price_for: 'за группу',
    fx_rate_to_usd: '1.137846', fx_verified_at: at, fx_evidence_ref: `tripster:fx:v2:EUR:USD:${'b'.repeat(64)}` });
}
// Synthetic supplier gateway answer (same shape as Georgia's gateway client).
function gatewayAnswer(request, overrides = {}) {
  const fxAt = isoSecondsAgo(3600000);
  return {
    status: 'ok', product_id: request.productId, date: request.date, people: request.people, basis: 'PER_GROUP', currency: 'EUR',
    supplier_value: '210.00', supplier_pre_pay: '55.00', supplier_payment_to_guide: '155.00', order_items: [{ id: 'x', count: 1 }],
    fx: { rate_to_usd: '1.137846', verified_at: fxAt, evidence_ref: `tripster:fx:v2:EUR:USD:${'b'.repeat(64)}` },
    catalog_swept_at: fxAt, quoted_at: isoSecondsAgo(2000), calls: { auth: 1, options: 1, price: 1 }, timing: { rate_limit_wait_ms: 0, options_ms: 1, price_ms: 1, process_ms: 1, tunnel: 'persistent', tunnel_ms: 1 }, wallMs: 5,
    ...overrides
  };
}

// Deterministic model: writes the product's price slot when the facts carry
// one; otherwise it fabricates the amount a careless model would invent, so a
// money-authority bypass becomes customer-visible instead of silently passing.
function directModel(calls) {
  return {
    complete: async input => {
      calls.push(1);
      if (input.purpose === 'direct_semantics') return { text: JSON.stringify(semanticFixture(input)) };
      if (input.purpose === 'direct_response_semantics') return { text: JSON.stringify({ priorClaims: [], completedActions: [], unsupportedProductClaims: [] }) };
      const prompt = JSON.stringify(input);
      const slot = prompt.match(/Price authority: «[^»]*» = (\[\[PRICE:\d+\]\])/);
      return { text: slot ? `Стоимость экскурсии «${TITLE}» — ${slot[1]}. Подходит Вам этот вариант?` : 'Точную стоимость сейчас подтвердить не могу.' };
    }
  };
}

// Purpose-typed offline model contract. These fixtures are authored decisions,
// not outputs of Georgia's regex/parser; the runtime validates their evidence.
function semanticFixture(request) {
  const data = JSON.parse(request.messages?.[1]?.content || '{}');
  const message = String(data.CURRENT_MESSAGE || '');
  const proposal = { format: { state: 'unknown', choice: null, source: null, quote: null }, updates: [], requestKind: 'travel', availabilityRequested: false, action: 'qualify', questions: [], correction: false, apologyWarranted: false, selection: null, releaseSelection: false, topicSwitch: false, transitionEvidence: null };
  if (/позовите Никиту|пожаловаться/i.test(message)) proposal.action = 'handoff';
  if (/сколько стоит|сколько будет стоить/i.test(message)) { proposal.action = 'answer'; proposal.questions = ['price']; }
  const facts = [
    ['Здравствуйте! На следующей неделе приезжаем, 2 человека, мы прилетаем в Батуми', '2', '2 человека', 'Батуми', 'На следующей неделе'],
    ['На следующей неделе приезжаем, нас будет 2 человека, мы прилетаем в Батуми', '2', 'нас будет 2 человека', 'Батуми', 'на следующей неделе'],
    ['На следующей неделе будем в Батуми, нас 2 человека, что посоветуете?', '2', 'нас 2 человека', 'Батуми', 'на следующей неделе'],
    ['Здравствуйте! Нас будет два человека на следующей неделе в Батуми', '2', 'два человека', 'Батуми', 'на следующей неделе'],
    ['Добрый день, мы на этой неделе будем в Грузии, нас 3 человека, стартуем из Тбилиси', '3', 'нас 3 человека', 'Тбилиси', 'на этой неделе'],
    ['Здравствуйте, приезжаем через неделю, 2 человека, будем жить в Батуми', '2', '2 человека', 'Батуми', 'через неделю'],
    ['Примерно через две недели прилетаем в Кутаиси, нас 4 человека', '4', 'нас 4 человека', 'Кутаиси', 'примерно через две недели'],
    ['Хотим поехать на выходных, 2 человека, из Тбилиси', '2', '2 человека', 'Тбилиси', 'на выходных'],
    ['Планируем в конце ноября, 2 человека, старт из Батуми', '2', '2 человека', 'Батуми', 'в конце ноября'],
    ['Будем в середине ноября, нас 2 человека, из Тбилиси', '2', 'нас 2 человека', 'Тбилиси', 'в середине ноября'],
    ['На следующей неделе ближе к выходным, 2 человека, мы в Батуми', '2', '2 человека', 'Батуми', 'на следующей неделе ближе к выходным'],
    ['Здравствуйте! 4 ноября приезжаем, 2 человека, мы прилетаем в Батуми', '2', '2 человека', 'Батуми', '4 ноября'],
    ['Нас 2 участника на следующей неделе в Батуми', '2', '2 участника', 'Батуми', 'на следующей неделе'],
    ['Нас двое с сыном на следующей неделе в Батуми', '3', 'двое с сыном', 'Батуми', 'на следующей неделе'],
    ['Нас два с сыном на следующей неделе в Батуми', '3', 'два с сыном', 'Батуми', 'на следующей неделе'],
    ['Нас 2 с сыном на следующей неделе в Батуми', '3', '2 с сыном', 'Батуми', 'на следующей неделе']
  ].find(row => row[0] === message);
  if (facts) {
    for (const [field, value, quote] of [['datesText', facts[4], message], ['people', Number(facts[1]), message], ['startCity', facts[3], message]]) {
      proposal.updates.push({ field, value, source: 'CURRENT_MESSAGE', quote });
    }
  }
  return proposal;
}

function createDirect(name, { row = authorityRow(), gateway = null, send = null, model = null } = {}) {
  const root = fs.mkdtempSync(path.join(WORK, `${name}-`));
  const effects = { sends: [], modelCalls: [], gatewayRequests: [], crm: [], managerTasks: [], needsHuman: [], legacyCalls: 0, retries: 0, cards: [] };
  const catalog = createDirectCatalogProvider({
    siteProvider: async () => ({ ok: true, cards: [] }),
    hybridProvider: async () => ({ ok: true, rawCards: [{ tripster_id: PRODUCT }], cards: [], mode: 'SYNTHETIC' }),
    rebindCard: (card, options) => rebindHybridCard(card, { ...options, findExactCard: () => row }),
    findExactCard: () => row,
    onDemandQuote: gateway ? async ({ exact, input }) => quoteOnDemand({ exact, input, gateway: async request => { effects.gatewayRequests.push(request); return gateway(request); } }) : null,
    env: {}
  });
  const spiedCatalog = async (options, input) => {
    const result = await catalog(options, input);
    for (const card of result?.cards || []) effects.cards.push({ id: card.id, sellPriceUsd: card.sellPriceUsd || null, priceBasis: card.priceBasis || null, quoteStatus: card.quoteStatus || null, source: card.source || null });
    return result;
  };
  const runtime = createGeorgiaDirectRuntime({
    storeOptions: { privateRoot: root, dbPath: path.join(root, 'state.sqlite') },
    expectedIdentity: { accountId: ACCOUNT, username: USERNAME },
    resolveTokenIdentity: async () => ({ accountId: ACCOUNT, username: USERNAME, enabled: true }),
    modelClient: (model || directModel)(effects.modelCalls),
    knowledgeProvider: createDirectKnowledgeProvider({ bundle: { knowledge: '' }, catalogProvider: spiedCatalog, webProvider: async () => ({ ok: false }) }),
    manualExampleProviderFactory: () => async () => [],
    sendInstagram: async input => {
      if (input.beforeGraphRequest) await input.beforeGraphRequest();
      effects.sends.push({ eventId: String(input.eventId), text: input.text });
      if (send) return send(input, effects.sends.length);
      return { ok: true, delivered: true, deliveryId: `synthetic_delivery_${effects.sends.length}`, recipientId: input.recipientId };
    },
    // Real CRM record builders; only the Telegram bridge transport is mocked.
    mirrorInbound: async input => { effects.crm.push({ kind: 'inbound', record: buildDirectInboundCrmMirrorRecord(input) }); return { ok: true }; },
    mirrorTurn: async input => { effects.crm.push({ kind: 'turn', record: buildDirectCrmMirrorRecord(input) }); return { ok: true }; },
    mirrorStatus: async input => { effects.crm.push({ kind: 'status', record: buildDirectStatusCrmMirrorRecord(input) }); return { ok: true }; },
    notifyManager: async () => ({ ok: true }),
    resolveConversationRecipient: async () => CUSTOMER,
    env: DIRECT_ENV,
    systemPrompt: 'Synthetic Georgia system prompt.'
  });
  return { runtime, effects };
}

function seedSelection(runtime, facts = {}) {
  runtime.store.upsertConversationContextEnvelope({ accountId: ACCOUNT, conversationId: CONVERSATION, accountAlias: USERNAME, envelope: { leadFacts: { selectedExperienceId: PRODUCT, selectedRouteKey: 'kakheti', routeKey: 'kakheti', ...facts }, lastOptions: [] } });
}

// Host boundary: the production disposition around V2 ownership.
async function deliverDirect({ runtime, effects }, eventId, message, legacyState) {
  const event = { id: eventId, eventId, accountId: ACCOUNT, ownerAccountId: ACCOUNT, ownerAccountSource: 'graph_token_bound_account', conversationId: CONVERSATION, customerId: CUSTOMER, senderId: CUSTOMER, recipientId: CUSTOMER, message, incomingAt: isoAgo(1000), created_time: isoAgo(1000), history: [], admission: { status: 'ALLOWED', reason: 'synthetic' } };
  return processDirectAtV2Boundary({
    message: event, legacyState,
    runV2: m => runDirectOwnership({ env: DIRECT_ENV, event: m, getRuntime: async () => runtime, sendEnabled: true }),
    runLegacy: async () => { effects.legacyCalls++; return { status: 'legacy' }; },
    markSeen: () => {}, scheduleRetry: () => { effects.retries++; },
    createManagerTask: task => effects.managerTasks.push(task.reason),
    mirrorInbound: () => {}, markNeedsHuman: item => effects.needsHuman.push(item.reason)
  });
}

function directSummary({ runtime, effects }, results) {
  const events = runtime.store.db.prepare("SELECT event_id, status FROM events WHERE account_id=? AND channel IN ('direct','fallback') ORDER BY event_id").all(ACCOUNT);
  const turns = effects.crm.filter(x => x.kind === 'turn').map(x => x.record);
  const sent = effects.sends.map(x => x.text);
  const lastSent = sent[sent.length - 1] || '';
  const card = effects.cards.filter(c => Number(c.id) === PRODUCT).pop() || {};
  return {
    statuses: results.map(r => String(r.status || '')),
    actions: results.map(r => String(r.action || '')),
    sends: sent.length,
    legacyCalls: effects.legacyCalls,
    retriesScheduled: effects.retries,
    managerTasks: effects.managerTasks.length,
    eventStates: events.map(e => e.status),
    calculatedPriceUsd: card.sellPriceUsd || null,
    calculatedBasis: card.priceBasis || null,
    quoteSource: card.source || null,
    gatewayRequests: effects.gatewayRequests.length,
    renderedMoney: moneyTokens(lastSent),
    percentRendered: percentPresent(lastSent),
    crmTurnWrites: turns.length,
    crmSentTurns: turns.filter(r => r.status === 'SENT').length,
    crmTurnMatchesDelivery: turns.length === 1 ? (turns[0].outgoing === lastSent && String(turns[0].deliveryId) === 'synthetic_delivery_1' && turns[0].source === 'georgia_v2_direct' && turns[0].actorType === 'agent' && turns[0].conversationId === CONVERSATION) : false,
    crmInboundWrites: effects.crm.filter(x => x.kind === 'inbound').length
  };
}

const SCENARIOS = {
  async hard_invariant(c) { return runHardInvariant(c, src, WORK); },
  // 1/8/10: discovery quote USD 90 -> tier markup -> round up -> $130 per person.
  async direct_priced_discovery() {
    const d = createDirect('discovery'); seedSelection(d.runtime);
    try { const r = await deliverDirect(d, 'synthetic_event_1', 'Сколько стоит?', {}); return directSummary(d, [r]); }
    finally { d.runtime.store.close(); }
  },
  // 1/10: concrete order -> live supplier quote EUR 210 x verified FX -> $320 per booking.
  async direct_exact_order_fx() {
    const order = futureOrder();
    // Catalog: EUR 210/group (discovery $320); supplier now: EUR 250/booking -> $360.
    const d = createDirect('exact', { row: eurGroupRow(), gateway: request => gatewayAnswer(request, { supplier_value: '250.00', supplier_payment_to_guide: '195.00' }) }); seedSelection(d.runtime, { people: 4, datesText: order.datesText });
    try { const r = await deliverDirect(d, 'synthetic_event_1', 'Сколько будет стоить?', {}); return directSummary(d, [r]); }
    finally { d.runtime.store.close(); }
  },
  // 1/10: discovery of an EUR listing: EUR 210 x verified FX -> USD -> $320 per group.
  async direct_discovery_eur_fx() {
    const d = createDirect('discoveryeur', { row: eurGroupRow() }); seedSelection(d.runtime);
    try { const r = await deliverDirect(d, 'synthetic_event_1', 'Сколько стоит?', {}); return directSummary(d, [r]); }
    finally { d.runtime.store.close(); }
  },
  // 2: the same inbound event delivered twice sends and mirrors exactly once.
  async direct_duplicate_inbound() {
    const d = createDirect('duplicate'); seedSelection(d.runtime);
    try {
      const first = await deliverDirect(d, 'synthetic_event_1', 'Сколько стоит?', {});
      const callsAfterFirst = d.effects.modelCalls.length;
      const second = await deliverDirect(d, 'synthetic_event_1', 'Сколько стоит?', {});
      return { ...directSummary(d, [first, second]), generationNotRepeated: d.effects.modelCalls.length === callsAfterFirst };
    } finally { d.runtime.store.close(); }
  },
  // 3/9: an ambiguous Graph response is DELIVERY_UNKNOWN: no resend on replay,
  // no SENT CRM turn, durable manager handoff instead of retry.
  async direct_delivery_unknown() {
    const d = createDirect('unknown', { send: input => ({ ok: true, delivered: true, recipientId: input.recipientId }) }); seedSelection(d.runtime);
    try {
      const state = {};
      const first = await deliverDirect(d, 'synthetic_event_1', 'Сколько стоит?', state);
      const replay = await deliverDirect(d, 'synthetic_event_1', 'Сколько стоит?', state);
      return directSummary(d, [first, replay]);
    } finally { d.runtime.store.close(); }
  },
  // 3/9 (transport): a timeout after the request may have reached Graph.
  async direct_delivery_timeout_unknown() {
    const d = createDirect('timeout', { send: () => { const e = new Error('synthetic timeout'); e.code = 'ETIMEDOUT'; throw e; } }); seedSelection(d.runtime);
    try {
      const state = {};
      const first = await deliverDirect(d, 'synthetic_event_1', 'Сколько стоит?', state);
      const replay = await deliverDirect(d, 'synthetic_event_1', 'Сколько стоит?', state);
      return directSummary(d, [first, replay]);
    } finally { d.runtime.store.close(); }
  },
  // 4: collector row without verified price evidence has no customer money.
  async direct_unverified_price() {
    const d = createDirect('unverified', { row: authorityRow({ price_verified: 'false' }) }); seedSelection(d.runtime);
    try { const r = await deliverDirect(d, 'synthetic_event_1', 'Сколько стоит?', {}); return directSummary(d, [r]); }
    finally { d.runtime.store.close(); }
  },
  // 4: stale price evidence is not authority either.
  async direct_stale_price_evidence() {
    const d = createDirect('stale', { row: authorityRow({ price_verified_at: isoAgo(30 * 86400000) }) }); seedSelection(d.runtime);
    try { const r = await deliverDirect(d, 'synthetic_event_1', 'Сколько стоит?', {}); return directSummary(d, [r]); }
    finally { d.runtime.store.close(); }
  },
  // 4: a failed exact quote withholds money; no fallback to the discovery price.
  async direct_exact_quote_unavailable() {
    const order = futureOrder();
    const d = createDirect('exactfail', { row: eurGroupRow(), gateway: () => ({ status: 'error', reason: 'SUPPLIER_TIMEOUT', detail: 'synthetic', calls: { options: 1, price: 0 }, timing: {} }) });
    seedSelection(d.runtime, { people: 4, datesText: order.datesText });
    try { const r = await deliverDirect(d, 'synthetic_event_1', 'Сколько будет стоить?', {}); return directSummary(d, [r]); }
    finally { d.runtime.store.close(); }
  },
  // 5/6/7: Comments have no pricing authority. The model echoes legacy/source
  // money in EUR, USD and GEL plus a prepayment share; nothing reaches Graph.
  async comments_money_suppressed() { return comments('money', { publicReply: 'Тур в Кахетию от 70 € с человека, подробности в Direct.', privateReply: 'Здравствуйте! Экскурсия стоит $130, предоплата 30%, ещё дегустация 50 лари. Напишите, пожалуйста, даты.' }); },
  async comments_unverified_source_price() { return comments('source', { publicReply: 'Наша цена 80$ за человека.', privateReply: 'Здравствуйте! По каталогу: Наша цена 80 USD, а у поставщика 46 евро. На какие даты планируете?' }, 'Каталог (без подтверждения цены): Кахетия — Наша цена: 80$; у поставщика 46 EUR.'); }
};

// These cases vary the actual semantic-model stage, then let the same typed
// response mock serve the other purposes. A failed interpretation is fail
// closed; response-stage failures are distinct and cannot rewrite validated
// customer facts.
function stagedModel(calls, mode) {
  const base = directModel(calls);
  return { complete: async request => {
    const purpose = request.purpose;
    if (mode === 'unavailable' && purpose === 'direct_semantics') { calls.push(1); const error = new Error('synthetic interpretation timeout'); error.code = 'ETIMEDOUT'; throw error; }
    if (mode === 'rejected' && purpose === 'direct_semantics') { calls.push(1); return { text: 'not a typed interpretation' }; }
    if (mode === 'response_unavailable' && purpose === undefined) { calls.push(1); const error = new Error('synthetic response timeout'); error.code = 'ETIMEDOUT'; throw error; }
    if (mode === 'response_rejected' && purpose === undefined) { calls.push(1); return { text: 'Стоимость — $180 за группу. Подтверждаю бронь.' }; }
    if (purpose === undefined) { calls.push(1); return { text: 'Какой формат поездки Вам ближе: групповой или индивидуальный?' }; }
    return base.complete(request);
  } };
}
const { quoteInputFrom } = src('instagram-v2/direct/catalog-selection');
const { FALLBACK_TEXT } = src('instagram-v2/direct/fallback-policy');
const REASK_PEOPLE = /сколько\s+(?:вас|человек|людей|гост|участник)|количеств\S*\s+(?:человек|гостей|участник)/iu;
const REASK_CITY = /из\s+какого\s+города|откуда\s+(?:вы\s+)?(?:старт|выезж|поед|начин)|город\S*\s+(?:старта|отправлени|выезда)/iu;
const REASK_DATE = /на\s+какие\s+даты|какого\s+числа|когда\s+(?:вы\s+)?(?:планиру|приезжа|прилета)/iu;
async function broadDateQualification({ message, model = 'qualification' }) {
  const d = createDirect('broaddate', { model: calls => stagedModel(calls, model) });
  try {
    const r = await deliverDirect(d, 'synthetic_event_1', message, {});
    const summary = directSummary(d, [r]);
    const facts = d.runtime.store.getConversationContextEnvelope({ accountId: ACCOUNT, conversationId: CONVERSATION })?.leadFacts || {};
    const conversation = d.runtime.store.getConversation(ACCOUNT, CONVERSATION) || {};
    const last = String(d.effects.sends[d.effects.sends.length - 1]?.text || '');
    return {
      statuses: summary.statuses, actions: summary.actions, sends: summary.sends, eventStates: summary.eventStates,
      managerTasks: summary.managerTasks, legacyCalls: summary.legacyCalls,
      handoffReason: String(conversation.needs_human_reason || ''),
      conversationMode: String(conversation.mode || ''),
      genericFallback: d.effects.sends.some(x => String(x.text).trim() === FALLBACK_TEXT),
      modelCalls: d.effects.modelCalls.length,
      people: Number.isInteger(facts.people) ? facts.people : null,
      startCity: facts.startCity || null,
      datePersisted: Boolean(String(facts.datesText || '').trim()),
      exactQuoteDate: Boolean(quoteInputFrom(facts)),
      reaskPeople: REASK_PEOPLE.test(last),
      reaskStartCity: REASK_CITY.test(last),
      reaskDate: REASK_DATE.test(last),
      gatewayRequests: summary.gatewayRequests,
      renderedMoney: summary.renderedMoney
    };
  } finally { d.runtime.store.close(); }
}
SCENARIOS.direct_broad_date_qualification = c => broadDateQualification(c.input);
SCENARIOS.direct_broad_date_matrix = async c => {
  const results = [];
  for (const turn of c.input.turns) {
    const output = await broadDateQualification(turn);
    results.push(Object.fromEntries(Object.keys(c.expected.results[results.length]).map(key => [key, output[key]])));
  }
  return { results };
};

async function comments(name, reply, policy = 'Synthetic policy.') {
  const root = fs.mkdtempSync(path.join(WORK, `comments-${name}-`));
  const publicCalls = []; const privateCalls = []; let modelCalls = 0;
  const runtime = createGeorgiaCommentsRuntime({
    storeOptions: { privateRoot: root, dbPath: path.join(root, 'comments.sqlite') }, expectedAccountId: ACCOUNT, env: COMMENTS_ENV,
    resolveTokenIdentity: async () => ({ accountId: ACCOUNT, username: USERNAME }),
    resolveConversation: async () => ({ status: 'EXISTING_AUTO', mode: 'AUTO', verified: true, conversationId: CONVERSATION, revision: 1, controlToken: 'synthetic' }),
    verifyConversation: async () => ({ status: 'EXISTING_AUTO', mode: 'AUTO', verified: true, conversationId: CONVERSATION, revision: 1 }),
    builderOptions: {
      modelClient: { completeStructured: async () => { modelCalls++; return { intent: 'lead', ...reply }; } },
      knowledgeProvider: async () => ({ systemPrompt: 'Synthetic system.', developerPolicy: policy })
    },
    sendPublicReply: async input => { publicCalls.push(input.text); return { ok: true, deliveryId: `public:${input.commentId}`, recipientId: input.commentId }; },
    sendPrivateReply: async input => { privateCalls.push(input.text); return { ok: true, deliveryId: `private:${input.commentId}`, recipientId: input.userId }; }
  });
  const body = id => ({ entry: [{ id: ACCOUNT, changes: [{ field: 'comments', value: { id, from: { id: CUSTOMER, username: 'synthetic_user' }, text: 'Сколько стоит тур в Кахетию?', media: { id: 'synthetic_media' }, timestamp: Math.floor(Date.now() / 1000) - 5 } }] }] });
  try {
    const [first] = await runtime.processWebhook(body('synthetic_comment_1'));
    const [replay] = await runtime.processWebhook(body('synthetic_comment_1'));
    const texts = [...publicCalls, ...privateCalls];
    return {
      modelCalls,
      publicSends: publicCalls.length,
      privateSends: privateCalls.length,
      publicState: String(first?.publicDeliveryState || ''),
      privateState: String(first?.privateDeliveryState || ''),
      replayStatus: String(replay?.status || ''),
      renderedMoney: texts.flatMap(moneyTokens),
      percentRendered: texts.some(percentPresent),
      nonEmptyPrivate: privateCalls.every(t => String(t).trim().length > 0)
    };
  } finally { runtime.store.close(); }
}

(async () => {
  const out = {};
  for (const c of CASES) {
    const scenario = SCENARIOS[c.scenario];
    if (!scenario) throw new Error(`HARNESS_UNKNOWN_SCENARIO:${c.scenario}`);
    out[c.id] = await scenario(c);
  }
  if (blocked.length) throw new Error(`EXTERNAL_OR_OUT_OF_SANDBOX_ACCESS:${[...new Set(blocked)].join(',')}`);
  process.stdout.write(JSON.stringify(out));
})().catch(error => { console.error(error && error.stack || String(error)); process.exitCode = 2; });
