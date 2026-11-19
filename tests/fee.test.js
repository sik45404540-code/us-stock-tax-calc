import test from 'node:test';
import assert from 'node:assert/strict';

import { brokerRoundTrip, compareBrokers } from '../src/fee.js';

test('환전우대 100%면 환전 비용이 0원이다', () => {
  const r = brokerRoundTrip({
    amount: 10_000_000,
    feeRate: 0.0007,
    fxDiscount: 1,
    spread: 0.01,
    returnRate: 0.1,
  });
  assert.equal(r.buyFx, 0);
  assert.equal(r.sellFx, 0);
  assert.equal(r.buyFee, 7_000);
  assert.equal(r.saleValue, 10_992_300);
  assert.equal(r.receipt, 10_984_605);
  assert.equal(r.totalCost, 14_695);
});

test('우대가 없으면 스프레드가 왕복으로 두 번 붙는다', () => {
  const r = brokerRoundTrip({
    amount: 10_000_000,
    feeRate: 0,
    fxDiscount: 0,
    spread: 0.01,
    returnRate: 0,
  });
  assert.equal(r.buyFx, 100_000);
  assert.equal(r.sellFx, 99_000);
  assert.equal(r.receipt, 9_801_000);
  assert.equal(r.totalCost, 199_000);
  assert.ok(Math.abs(r.costRate - 0.0199) < 1e-9);
});

test('손익분기 수익률로 팔면 원금과 같아진다', () => {
  const base = { amount: 10_000_000, feeRate: 0.0025, fxDiscount: 0.9, spread: 0.01 };
  const probe = brokerRoundTrip({ ...base, returnRate: 0 });
  const r = brokerRoundTrip({ ...base, returnRate: probe.breakEvenRate });
  assert.ok(Math.abs(r.receipt - 10_000_000) <= 2, `실수령 ${r.receipt}`);
});

test('수수료율·우대율이 다르면 실수령 차이가 난다', () => {
  const cmp = compareBrokers({
    amount: 10_000_000,
    spread: 0.01,
    returnRate: 0.1,
    a: { label: 'A', feeRate: 0.0007, fxDiscount: 1 },
    b: { label: 'B', feeRate: 0.0025, fxDiscount: 0.9 },
  });
  assert.equal(cmp.a.receipt, 10_984_605);
  assert.equal(cmp.b.receipt, 10_923_190);
  assert.equal(cmp.diff, -61_415);
  assert.equal(cmp.cheaper, 'a');
  assert.ok(cmp.diffCost > 58_000);
});

test('수익률이 0이어도 왕복 비용만큼 손실이 난다', () => {
  const r = brokerRoundTrip({
    amount: 5_000_000,
    feeRate: 0.0025,
    fxDiscount: 0.95,
    spread: 0.01,
    returnRate: 0,
  });
  assert.ok(r.receipt < 5_000_000);
  assert.ok(r.profit < 0);
  assert.ok(r.totalCost > 20_000);
});

test('두 계좌가 같으면 차이가 0이고 same으로 표시한다', () => {
  const cmp = compareBrokers({
    amount: 3_000_000,
    spread: 0.01,
    a: { feeRate: 0.001, fxDiscount: 0.95 },
    b: { feeRate: 0.001, fxDiscount: 0.95 },
  });
  assert.equal(cmp.diff, 0);
  assert.equal(cmp.cheaper, 'same');
  assert.equal(cmp.a.receipt, cmp.b.receipt);
});

test('투자금이 없으면 0으로 안전하게 계산한다', () => {
  const r = brokerRoundTrip({ amount: 0 });
  assert.equal(r.receipt, 0);
  assert.equal(r.totalCost, 0);
  assert.equal(r.costRate, 0);
});
