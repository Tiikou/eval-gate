'use strict';
// Gate-owned source compatibility for the integration harness (moved from the
// candidate repository's scripts/georgia-eval-fixture-adapter.cjs so a
// candidate cannot shape its own mocks). Behaviour is unchanged.
// Extend the upstream gate's explicitly mocked collector-row boundary to the
// newer descriptive-facts callback. Only the original synthetic row's values
// are projected by the real application helper; no production facts are read.
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
if (!String(process.argv[1]).endsWith('/georgia/integration.cjs')) {
  throw new Error('GEORGIA_EVAL_FIXTURE_SCOPE_INVALID');
}
const originalLoad = Module._load;
const wrapped = new WeakMap();
const context = new AsyncLocalStorage();
const negative = process.argv.includes('--georgia-eval-negative');
const positiveIds = new Set(['int_handoff_custom_incomplete_auto', 'int_handoff_custom_complete_notify_once']);
const handoffCases = JSON.parse(fs.readFileSync(process.argv[5], 'utf8')).filter(item => item.scenario === 'direct_handoff_lifecycle');
let handoffCursor = 0;
Module._load = function (request, parent, isMain) {
  const exports = originalLoad.call(this, request, parent, isMain);
  if (negative && String(request).endsWith('direct/builder') && exports.createGeorgiaDirectBuilder) {
    if (wrapped.has(exports)) return wrapped.get(exports);
    const result = { ...exports, createGeorgiaDirectBuilder: options => {
      const builder = exports.createGeorgiaDirectBuilder(options);
      return async input => {
        const output = await builder(input);
        const scope = context.getStore();
        if (positiveIds.has(scope?.caseId)) console.error('GEORGIA_NEGATIVE_BUILDER_TRACE=' + JSON.stringify({
          caseId: scope.caseId, messageSha256: crypto.createHash('sha256').update(String(input.message)).digest('hex'),
          type: output?.type, reason: output?.reason, validationReason: output?.validationReason,
          originalReplyAdmitted: String(output?.text || '').includes('Какой формат поездки Вам ближе: групповой или индивидуальный?')
        }));
        return output;
      };
    } };
    wrapped.set(exports, result);
    return result;
  }
  if (String(request).endsWith('runtime/direct-runtime')) {
    if (wrapped.has(exports)) return wrapped.get(exports);
    const result = { ...exports, createGeorgiaDirectRuntime: options => {
      const privateRoot = options.storeOptions?.privateRoot || '';
      let caseId = null;
      if (path.dirname(privateRoot) === process.argv[3] && path.basename(privateRoot).startsWith('handoff-')) {
        const item = handoffCases[handoffCursor++];
        if (!item) throw new Error('GEORGIA_EVAL_HANDOFF_CASE_SCOPE_MISMATCH');
        caseId = item.id;
      }
      const client = options.modelClient;
      if (!client || typeof client.complete !== 'function') return exports.createGeorgiaDirectRuntime(options);
      const modelClient = { ...client, complete: async input => {
        const response = await client.complete(input);
        if (!negative && positiveIds.has(caseId) && input.purpose === undefined && response?.text === 'Какой формат поездки Вам ближе: групповой или индивидуальный?') {
          // The canonical synthetic offer is group-only. This old generic
          // question now correctly trips the real product-format guard.
          // Use a factual-neutral fixture reply; never bypass that guard.
          return { ...response, text: 'Пожелания понятны, спасибо.' };
        }
        if (input.purpose !== 'direct_response_semantics') return response;
        let data, review;
        try {
          data = JSON.parse(input.messages?.[1]?.content || '{}');
          review = JSON.parse(typeof response === 'string' ? response : response?.text);
        } catch (_) { return response; }
        const keys = Object.keys(review).sort();
        const legacyEmpty = JSON.stringify(keys) === JSON.stringify(['completedActions', 'priorClaims', 'unsupportedProductClaims'])
          && keys.every(key => Array.isArray(review[key]) && review[key].length === 0);
        if (!legacyEmpty || !Array.isArray(data.PRODUCT_FACTS) || !data.PRODUCT_FACTS.length) return response;
        // Preserve the legacy fixture's explicit no-product-assertions verdict
        // in the newer required schema. Real claim/price/action guards still run.
        const text = JSON.stringify({ ...review, productClaims: [] });
        return typeof response === 'string' ? text : { ...response, text };
      } };
      const runtime = exports.createGeorgiaDirectRuntime({ ...options, modelClient });
      return { ...runtime, process: input => context.run({ caseId }, () => runtime.process(input)) };
    } };
    wrapped.set(exports, result);
    return result;
  }
  if (!String(request).endsWith('tripster-hybrid-catalog-provider')) return exports;
  if (wrapped.has(exports)) return wrapped.get(exports);
  const adapt = options => {
    if (!options || typeof options.findExactCard !== 'function' || options.findFacts !== undefined) {
      return options;
    }
    return { ...options, findFacts: input => {
      const row = options.findExactCard(input);
      if (!row) return null;
      const sourceRow = { ...row, tripster_id: row.product_id, type: row.kind,
        source_row: 2, full_description: row.description || '' };
      const bytes = Buffer.from(JSON.stringify(sourceRow));
      const digest = crypto.createHash('sha256').update(bytes).digest('hex');
      const file = path.join(process.argv[3], `synthetic-collector-row-${digest}.json`);
      fs.writeFileSync(file, bytes, { mode: 0o600 });
      const { productFactsForCanonicalRow } = require(path.join(process.argv[2], 'instagram-v2/direct/product-facts'));
      return productFactsForCanonicalRow({ listingId: input.listingId, row: sourceRow,
        source: { path: file, sha256: digest } });
    } };
  };
  const result = {
    ...exports,
    createDirectCatalogProvider: options => exports.createDirectCatalogProvider(adapt(options)),
    rebindHybridCard: (card, options) => exports.rebindHybridCard(card, adapt(options))
  };
  wrapped.set(exports, result);
  return result;
};
