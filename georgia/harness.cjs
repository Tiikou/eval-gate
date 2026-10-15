'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const [root, work, nativeRoot, casesFile] = process.argv.slice(2);
const nativeRequire = createRequire(path.join(nativeRoot, 'package.json'));
const cache = new Map();
const inside = (p, dir) => { const x = path.resolve(p); return x === dir || x.startsWith(dir + path.sep); };
// Capabilities for copied code: no process/env, fetch, network or child process.
// Filesystem access only to snapshot and disposable DB root. Native sqlite is
// trusted existing better-sqlite3, fed only a temporary DB filename.
const safeFs = {};
for (const method of ['readFileSync','readdirSync','existsSync','statSync','realpathSync']) {
  safeFs[method] = (p, ...args) => {
    if (!inside(p, root) && !inside(p, work)) throw new Error('FS_READ_BLOCKED');
    return fs[method](p, ...args);
  };
}
safeFs.lstatSync = (p, ...args) => {
  if (!inside(p, root) && !inside(p, work) && !work.startsWith(path.resolve(p) + path.sep) && path.resolve(p) !== '/') throw new Error('FS_METADATA_BLOCKED');
  return fs.lstatSync(p, ...args);
};
for (const method of ['mkdirSync','chmodSync']) safeFs[method] = (p, ...args) => {
  if (!inside(p, work)) throw new Error('FS_WRITE_BLOCKED');
  return fs[method](p, ...args);
};
const RealDB = nativeRequire('better-sqlite3');
function SafeDB(p) { if (!inside(p, work)) throw new Error('DB_PATH_BLOCKED'); return new RealDB(p); }
function load(file) {
  file = path.resolve(file);
  if (!inside(file, root)) throw new Error('MODULE_PATH_BLOCKED');
  if (!fs.existsSync(file)) file += '.js';
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const localRequire = name => {
    if (name === 'node:fs' || name === 'fs') return safeFs;
    if (['node:path','node:crypto'].includes(name)) return require(name);
    if (name === 'better-sqlite3') return SafeDB;
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name));
    throw new Error(`MODULE_CAPABILITY_BLOCKED:${name}`);
  };
  const fn = new vm.Script(`(function(require,module,exports,__dirname){${fs.readFileSync(file,'utf8')}\n})`, { filename: file }).runInNewContext({ URL, URLSearchParams });
  fn(localRequire, module, module.exports, path.dirname(file));
  return module.exports;
}
const pricing = load(path.join(root, 'georgia-sales-pricing.js'));
const delivery = load(path.join(root, 'instagram-v2/delivery-classifier.js'));
const money = load(path.join(root, 'instagram-v2/direct/money-authority.js'));
const comments = load(path.join(root, 'instagram-v2/comments/no-money.js'));
const crm = load(path.join(root, 'instagram-v2/integration/direct-crm-mirror-record.js'));
const reconcile = load(path.join(root, 'instagram-v2/integration/comment-private-crm-reconcile.js'));
const legacy = load(path.join(root, 'legacy_policy.cjs'));
const storeModule = load(path.join(root, 'instagram-v2/state-store.js'));
const NOW = '2026-10-01T10:00:00.000Z';
const opts = { now: NOW, maxAgeMs: 43200000 };
const baseQuote = { supplier: 'synthetic_supplier', supplierProductId: '42', scope: { scopeId: '42:PER_PERSON', productId: '42', priceBasis: 'PER_PERSON' }, pricingModel: 'fixed', priceVerified: true, priceEvidenceRef: 'synthetic:42', priceVerifiedAt: NOW, sourceCurrency: 'USD', sourcePrice: '90.00', prepayVerified: false };
async function run(c) {
  const input = c.input || {};
  switch (c.kind) {
    case 'legacy': return legacy.quote(input);
    case 'legacy_replay': { const first = legacy.quote(input); return legacy.quote(first); }
    case 'pricing': return { price: pricing.calculatePrice(input.cost).sell_price_usd };
    case 'quote': { const q = pricing.buildQuote({ ...baseQuote, ...input }, opts); return { cost: q.supplier_cost_usd, price: q.sell_price_usd, currency: pricing.clientProjection(q).currency, paymentReady: pricing.clientProjection(q).payment_quote_ready }; }
    case 'delivery': return { state: delivery.classifyDeliveryResult(input.result, 'synthetic_recipient').status };
    case 'delivery_error': return { state: delivery.classifyDeliveryError(input).status };
    case 'money': { const r = money.renderMoney(input.text, input.context || {}, { grounded: false, strict: true }); const moneyTokens = [...String(r.text || '').matchAll(/([$€])\s*(\d+(?:[.,]\d{1,2})?)/g)].map(m => ({amount:m[2].replace(',', '.'), currency:m[1] === '$' ? 'USD' : 'EUR'})); return { accepted: r.text !== null, reason: r.reason || null, moneyTokens }; }
    case 'comments': { const text = comments.commentTextWithoutMoney(input.text); return { moneyPresent: money.moneyShaped(text, { strict: true }), hasRoute: text.includes('Кахетия'), empty: text === '' }; }
    case 'crm': { const r = crm.buildDirectCrmMirrorRecord({ accountId: 'synthetic_account', conversationId: 'synthetic_conversation', inboundEventId: 'synthetic_event', source: 'georgia_v2_direct', actorType: 'agent', outgoing: 'synthetic reply', outboundDeliveryId: 'synthetic_delivery', deliveryStatus: 'SENT', ...input }); return { status: r.status }; }
    case 'crm_reconcile': { let writes = 0; const r = await reconcile.reconcileCommentPrivateToCrm({ accountId: 'synthetic_account', commentId: 'synthetic_event', recipientId: 'synthetic_recipient', deliveryId: 'synthetic_delivery', exactPrivateText: 'synthetic reply', knownConversationId: 'synthetic_conversation', outboundAt: NOW, resolveConversationRecipient: async () => input.reverseRecipient || 'synthetic_recipient', mirrorTurn: async () => { writes++; return input.bridgeResult || { ok: true }; }, getMirrorDeliveryStatus: async () => ({ status: input.bridgeStatus || 'sent' }) }); return { status: r.status, writes }; }
    case 'state': {
      const dir = path.join(work, c.id); const store = storeModule.initializeStore({ privateRoot: dir, dbPath: path.join(dir,'control.sqlite'), now: () => new Date(NOW) });
      try {
        store.registerAccount({ accountId: 'synthetic_account', username: 'synthetic_account', enabled: true });
        const x = { accountId: 'synthetic_account', conversationId: 'synthetic_conversation', channel: input.channel || 'direct', eventId: 'synthetic_event', allowRetryRejected: input.outcome === 'FAILED' };
        let sends = 0, writes = 0;
        const attempt = () => {
          const claim = store.claimEvent(x);
          if (!claim.claimed) return claim.status;
          sends++; store.markEventSending(x);
          if (input.outcome === 'UNKNOWN') store.markEventDeliveryUnknown({ ...x, errorCode: 'synthetic_timeout' });
          else if (input.outcome === 'FAILED') store.markEventRejectedBeforeDelivery({ ...x, errorCode: 'synthetic_rejection' });
          else { store.commitEventSent({ ...x, deliveryId: 'synthetic_delivery' }); writes++; }
          return 'first_attempt';
        };
        attempt(); const replay = attempt(); return { sends, writes, replay };
      } finally { store.close(); }
    }
    default: throw new Error('HARNESS_UNKNOWN_KIND');
  }
}
(async () => {
 const out = {};
 for (const c of JSON.parse(fs.readFileSync(casesFile,'utf8'))) {
   try { out[c.id] = await run(c); }
   catch (e) {
     // Expected business refusals only; loader/DB/infrastructure exceptions
     // must abort rather than masquerading as a successful refusal.
     if (e.name === 'PricingError' || ['delivery_status_not_sent','source_not_georgia_v2_direct','conversation_id_required','actor_type_not_agent'].includes(e.message)) out[c.id] = { error: e.code || e.message };
     else throw e;
   }
 }
 console.log(JSON.stringify(out));
})().catch(e => { console.error(e.stack); process.exitCode = 2; });
