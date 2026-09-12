import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

test('phone layout is isolated to a narrow-screen media query', () => {
  const start = html.indexOf('/* Phone-only refinements.');
  const end = html.indexOf('</style>', start);
  assert.ok(start >= 0 && end > start, 'phone-only stylesheet block exists');
  const css = html.slice(start, end);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(css, /\.filter-disclosure > summary \{[\s\S]*?display: flex;/);
  assert.match(css, /\.mobile-nav \.nav-button \{[\s\S]*?flex: 0 0 25%;[\s\S]*?color: var\(--text-soft\);/);
  assert.match(css, /\.app-rail :is\(button, summary\)[\s\S]*?min-height: 44px !important;/);
  assert.match(css, /\.table-wrap \{ max-width: 100%; overscroll-behavior-inline: contain; \}/);
});

test('filter panels start collapsed only on phones', () => {
  assert.match(html, /const initialFilterDisclosureOpen = !window\.matchMedia\("\(max-width: 680px\)"\)\.matches;/);
  for (const panel of [
    'commission-main',
    'reimbursement-details',
    'daily-sales-branch-overview',
    'daily-sales-hq-dealer-overview',
    'job-booking',
    'pending-job',
    'pending-payment-combined',
    'quantity-pitstop-details',
    'quantity-pitstop-summary'
  ]) {
    assert.match(html, new RegExp(`"${panel}": initialFilterDisclosureOpen`));
  }
});
