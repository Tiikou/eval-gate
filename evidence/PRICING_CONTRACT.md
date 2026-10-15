# Georgia production pricing contract (evidence)

Source: canonical Direct/webhook `2ebaf59d78fb8adddc4aa035f63184a751a08f97` (tree `cc49005…`);
Gateway companion `263f9baef218fbc2d8b1c1f56525b1641f3c4337`. Live Direct/webhook processes run from
`releases/git-2ebaf59…-aux-combined-v1`; 485 runtime files byte-identical to Git (read-only check 2026-10-01).

| Path | Authority | Files / call path |
|---|---|---|
| Direct discovery | Collector XLSX authority row -> `safeProjection` -> `quoteFromPricingRow` -> `buildQuote` (price verified + fresh evidence; FX evidence for non-USD) -> `calculatePrice` -> "Ориентир по стоимости: $X …"; payment authority stripped | `instagram-v2/providers/tripster-hybrid-catalog-provider.js` (`rebindHybridCard`), `georgia-sales-pricing-columns.js`, `georgia-sales-pricing.js` |
| Direct exact order | Live supplier quote via parser gateway -> `quoteOnDemand` (`convertToUsd` + `calculatePrice`, prepay/deposit) -> `applyExactQuote`; any failure -> `withoutCustomerMoney` (no catalog fallback) | `georgia-on-demand-quote.js`, `tripster-quote-gateway-client.js`, provider `quoteForOrder` |
| Rendering | Model writes only `[[PRICE:id]]`/`[[DEPOSIT:id]]`/`[[BALANCE:id]]`; `renderMoney`/`renderSlots` substitute the validated label; any other amount is refused | `instagram-v2/direct/money-authority.js`, `instagram-v2/direct/output-guard.js` |
| Comment-origin Direct recommendation | Only `validatedClientQuote` (V1 row with bound evidence); legacy «Наша цена» never shown | `instagram-v2/direct/comment-origin-recommendation.js` |
| Comments (public + comment private) | No pricing authority: `commentTextWithoutMoney` removes money claims, code-owned deferral | `instagram-v2/comments/no-money.js`, `instagram-v2/adapters/comments-adapter.js` |
| Legacy Direct reply path | No pricing authority: `legacyReplyWithoutMoney` | `instagram-agent.js` |
| Site catalog fallback | No money (`withoutCustomerMoney`) | provider `safeSiteFallback` |
| Gateway companion 263f9ba | No customer pricing authority (CRM reply hook relays manager-authored text; no `georgia-sales-pricing`) | `openclaw-hooks/georgia-ig-crm-reply-v2` |
| Comments relay (844e76d) | Ingress relay only; forwards webhooks to webhook-v2, composes no customer text | `scripts/georgia-comments-relay-server.js` |

Tier (`GEORGIA_SALES_PRICING_V1`, USD cents): <50: max(40%, $20); 50–100: max(40%, $30);
100–250: max(30%, $40); 250–500: max(20%, $75); >=500: max(20%, $100); sell = roundUp(cost + markup, $10).

Worked examples asserted end to end: USD 90 -> $130/person; EUR 210 x 1.137846 -> $320/group;
live EUR 250 x 1.137846 -> $360/booking.

`+€25` (`EUR + 25 -> nearest €10`): found in no source/runtime path -> LEGACY_REFERENCE_ONLY.
