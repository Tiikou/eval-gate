'use strict';
// User-requested legacy contract reference. NOT deployed Georgia code.
// EUR stays EUR; no inferred FX. Half-up nearest ten after one markup.
function quote({ amount, currency = 'EUR', final = false } = {}) {
  if (currency !== 'EUR') return { error: 'WRONG_CURRENCY' };
  if (typeof amount !== 'string' || !/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(amount)) return { error: 'MISSING_OR_INVALID_PRICE' };
  const [whole, fraction = ''] = amount.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents <= 0n || cents > 100000000n) return { error: 'MISSING_OR_INVALID_PRICE' };
  const raw = final ? cents : cents + 2500n;
  const result = final ? raw : ((raw + 500n) / 1000n) * 1000n;
  return { amount: `${result / 100n}.${String(result % 100n).padStart(2, '0')}`, currency: 'EUR', final: true };
}
module.exports = { quote };
