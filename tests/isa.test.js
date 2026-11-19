import test from 'node:test';
import assert from 'node:assert/strict';

import { calcIsa, ISA, ISA_TYPES } from '../src/isa.js';

test('일반형 ISA는 200만 원 초과분에만 9.9%가 붙는다', () => {
  const r = calcIsa({ type: 'general', annualProfit: 5_000_000, years: 3, contribution: 30_000_000 });
  assert.equal(r.exemption, 2_000_000);
  assert.equal(r.grossProfit, 15_000_000);
  assert.equal(r.netProfit, 15_000_000);
  assert.equal(r.taxableInIsa, 13_000_000);
  assert.equal(r.isaTax, 1_287_000);
  assert.equal(r.generalTax, 2_310_000); // 15.4%
  assert.equal(r.saving, 1_023_000);
});

test('서민·농어민형은 400만 원까지 비과세', () => {
  const r = calcIsa({ type: 'lowIncome', annualProfit: 1_000_000, years: 3 });
  assert.equal(r.exemption, 4_000_000);
  assert.equal(r.netProfit, 3_000_000);
  assert.equal(r.isaTax, 0);
  assert.equal(r.generalTax, 462_000);
  assert.equal(r.saving, 462_000);
  assert.equal(r.unusedExemption, 1_000_000);
});

test('ISA는 손익통산이 되고 일반계좌는 이익 쪽에 그대로 과세된다', () => {
  const r = calcIsa({ type: 'general', annualProfit: 5_000_000, years: 1, losses: 6_000_000 });
  assert.equal(r.grossProfit, 5_000_000);
  assert.equal(r.offsetLoss, 5_000_000);
  assert.equal(r.netProfit, 0);
  assert.equal(r.isaTax, 0);
  assert.equal(r.generalTax, 770_000);
  assert.equal(r.saving, 770_000);
  assert.equal(r.generalReceipt, 0);
});

test('순수익이 비과세 한도에 못 미치면 세금이 0원이다', () => {
  const r = calcIsa({ type: 'general', annualProfit: 500_000, years: 2 });
  assert.equal(r.netProfit, 1_000_000);
  assert.equal(r.isaTax, 0);
  assert.equal(r.saving, 154_000);
});

test('납입한도를 넘으면 경고를 남긴다', () => {
  const over = calcIsa({ type: 'general', annualProfit: 1_000_000, years: 3, contribution: 120_000_000 });
  assert.equal(over.limitWarnings.length >= 1, true);
  assert.match(over.limitWarnings[0].text, /1억/);

  const perYear = calcIsa({ type: 'general', annualProfit: 1_000_000, years: 1, contribution: 25_000_000 });
  assert.equal(perYear.limitWarnings.some((w) => /2,000만/.test(w.text)), true);
});

test('의무가입기간 3년 미만이면 안내를 붙인다', () => {
  const r = calcIsa({ type: 'general', annualProfit: 3_000_000, years: 1 });
  assert.equal(r.limitWarnings.some((w) => /3년/.test(w.text)), true);
});

test('만기 후 연금계좌 전환 세액공제는 10%, 최대 300만 원', () => {
  const big = calcIsa({ type: 'general', annualProfit: 5_000_000, years: 3, contribution: 30_000_000 });
  assert.equal(big.pensionBase, 45_000_000);
  assert.equal(big.pensionCredit, 3_000_000);

  const small = calcIsa({ type: 'general', annualProfit: 1_000_000, years: 3, contribution: 6_000_000 });
  assert.equal(small.pensionCredit, 900_000);
});

test('유형·기간 입력이 어긋나면 안전한 기본값으로 계산한다', () => {
  const r = calcIsa({ type: 'unknown', annualProfit: 1_000_000, years: 0 });
  assert.equal(r.type, 'general');
  assert.equal(r.years, ISA.minYears);
});

test('상수는 2026년 기준과 일치한다', () => {
  assert.equal(ISA_TYPES.general.exemption, 2_000_000);
  assert.equal(ISA_TYPES.lowIncome.exemption, 4_000_000);
  assert.equal(ISA.separateRate, 0.099);
  assert.equal(ISA.generalRate, 0.154);
  assert.equal(ISA.annualLimit, 20_000_000);
  assert.equal(ISA.totalLimit, 100_000_000);
});
