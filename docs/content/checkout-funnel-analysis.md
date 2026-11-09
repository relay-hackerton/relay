## Summary

Checkout conversion fell from **3.4% to 2.7%** of sessions between August and October 2026 while traffic grew 18%. Almost all of the loss happens between the payment form and a confirmed order, and it is concentrated on mobile web and on two payment methods.

- Payment form → order confirmed dropped from 71% to 58%.
- Mobile web accounts for 64% of sessions but only 41% of orders.
- Card 3-D Secure challenges and bank transfer time-outs explain about two thirds of the new failures.

Fixing the payment step alone would recover an estimated **₩182M per month** in gross merchandise value at current traffic.

## Data and method

| Source | Period | Volume |
|---|---|---|
| Web and app events (PostHog) | Aug 1 – Oct 31, 2026 | 9.6M sessions |
| Payment gateway logs | Aug 1 – Oct 31, 2026 | 412k attempts |
| Support tickets tagged "payment" | Sep 1 – Oct 31, 2026 | 3,120 tickets |

A session counts as reaching a step when the step's page view event fires. Orders are matched to sessions by order ID. Bots and internal accounts are excluded. Numbers are rounded to the nearest whole percent unless shown otherwise.

## Funnel overview

| Step | Aug | Oct | Change |
|---|---|---|---|
| Product viewed | 100% | 100% | — |
| Added to cart | 11.8% | 12.1% | +0.3 pt |
| Checkout started | 6.9% | 7.0% | +0.1 pt |
| Payment form viewed | 4.8% | 4.7% | −0.1 pt |
| Order confirmed | 3.4% | 2.7% | **−0.7 pt** |

```chart
title: Share of checkout starters reaching each step (October)
Checkout started | 100%
Shipping filled | 84%
Payment form viewed | 67%
Payment submitted | 52%
Order confirmed | 39%
```

The upper funnel is stable. The drop is between viewing the payment form and a confirmed order.

## Drop-off by segment

| Segment | Share of sessions | Payment → order (Aug) | Payment → order (Oct) |
|---|---|---|---|
| Mobile web | 64% | 66% | 49% |
| Desktop web | 24% | 79% | 76% |
| iOS app | 8% | 81% | 80% |
| Android app | 4% | 77% | 74% |

```chart
title: Payment failures by method (October, per 100 attempts)
Card with 3-D Secure | 31
Bank transfer | 24
Card without 3-D Secure | 9
Easy pay (wallets) | 6
```

Mobile web is the only segment that moved meaningfully. Within mobile web, failures cluster on card payments that trigger a 3-D Secure challenge and on bank transfers.

## Root causes

1. **3-D Secure pop-up blocked on mobile browsers.** Since the gateway SDK update on Sep 3, the challenge opens in a new window; in-app browsers (Instagram, KakaoTalk) block it. 38% of failed card attempts on mobile web come from in-app browsers.
2. **Bank transfer time-out too short.** The deposit window is 10 minutes; 46% of expired transfers were paid between minute 10 and minute 30.
3. **Form reset on error.** When a payment fails, the shipping address form is cleared. Support tickets mention "had to type everything again" 412 times.
4. Price shown in cart and payment step differ by the delivery fee for 9% of orders, which correlates with abandonment on the payment form.

## Recommendations

| Priority | Change | Expected impact | Effort |
|---|---|---|---|
| P0 | Render 3-D Secure inline (iframe) instead of a pop-up | +0.35 pt conversion | M |
| P0 | Keep form state after a failed payment | +0.10 pt | S |
| P1 | Extend bank transfer window to 30 minutes, with a reminder | +0.12 pt | S |
| P1 | Show the delivery fee in the cart total | +0.05 pt | S |
| P2 | Default mobile web users to wallet payment when available | +0.08 pt | M |

Together the P0 and P1 changes are expected to bring conversion back to about **3.3%** within one release cycle.

## Experiment plan and next steps

- Ship the P0 fixes behind a flag to 50% of mobile web traffic for two weeks; primary metric is payment → order rate, guardrail is fraud chargeback rate.
- Bank transfer window change goes to 100% after finance confirms reconciliation can handle 30-minute holds.
- Add a dashboard tile for payment failures by method and browser, with an alert when any method fails more than 25% of attempts in a day.
- Open: do we drop the separate payment page entirely and move payment into the checkout page on mobile?
