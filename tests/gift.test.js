import test from 'node:test';
import assert from 'node:assert/strict';

import {
  giftTax,
  bracketFor,
  compareSpouseGift,
  RELATIONS,
  GIFT,
} from '../src/gift.js';

/* ── 관계별 공제 ───────────────────────────────────────── */

test('배우자 6억까지는 증여세가 0원이다', () => {
  const r = giftTax({ amount: 600_000_000, relation: 'spouse' });
  assert.equal(r.taxableValue, 600_000_000);
  assert.equal(r.deduction, 600_000_000);
  assert.equal(r.taxBase, 0);
  assert.equal(r.total, 0);
  assert.equal(r.belowDeduction, true);
});

test('배우자 10억이면 과세표준 4억에 20%−1천만, 신고공제 3%를 뺀다', () => {
  const r = giftTax({ amount: 1_000_000_000, relation: 'spouse' });
  assert.equal(r.taxBase, 400_000_000);
  assert.equal(r.bracket.rate, 0.2);
  assert.equal(r.computedTax, 70_000_000);
  assert.equal(r.reportCredit, 2_100_000);
  assert.equal(r.total, 67_900_000);
});

test('직계존속→성인 자녀 5천만은 공제 한도 안이라 0원이다', () => {
  const r = giftTax({ amount: 50_000_000, relation: 'parentAdult' });
  assert.equal(r.deduction, 50_000_000);
  assert.equal(r.taxBase, 0);
  assert.equal(r.total, 0);
});

test('직계존속→성인 자녀 3억은 과세표준 2.5억', () => {
  const r = giftTax({ amount: 300_000_000, relation: 'parentAdult' });
  assert.equal(r.taxBase, 250_000_000);
  assert.equal(r.computedTax, 40_000_000);
  assert.equal(r.total, 38_800_000);
});

test('직계존속→미성년 자녀 공제는 2천만 원이다', () => {
  const r = giftTax({ amount: 100_000_000, relation: 'parentMinor' });
  assert.equal(r.deduction, 20_000_000);
  assert.equal(r.taxBase, 80_000_000);
  assert.equal(r.computedTax, 8_000_000);
  assert.equal(r.total, 7_760_000);
  assert.equal(r.minor, true);
});

test('직계비속→부모, 기타친족, 타인 한도가 각각 다르다', () => {
  assert.equal(RELATIONS.childToParent.limit, 50_000_000);
  assert.equal(RELATIONS.relative.limit, 10_000_000);
  assert.equal(RELATIONS.stranger.limit, 0);

  const toParent = giftTax({ amount: 100_000_000, relation: 'childToParent' });
  assert.equal(toParent.taxBase, 50_000_000);
  assert.equal(toParent.computedTax, 5_000_000);

  const relative = giftTax({ amount: 100_000_000, relation: 'relative' });
  assert.equal(relative.taxBase, 90_000_000);

  const stranger = giftTax({ amount: 100_000_000, relation: 'stranger' });
  assert.equal(stranger.deduction, 0);
  assert.equal(stranger.taxBase, 100_000_000);
  assert.equal(stranger.computedTax, 10_000_000);
  assert.equal(stranger.total, 9_700_000);
});

/* ── 혼인·출산 공제 ───────────────────────────────────── */

test('혼인·출산 공제 1억은 기본공제와 별도로 더해진다', () => {
  const r = giftTax({ amount: 300_000_000, relation: 'parentAdult', marriageBirth: true });
  assert.equal(r.deductionBase, 50_000_000);
  assert.equal(r.deductionExtra, 100_000_000);
  assert.equal(r.deduction, 150_000_000);
  assert.equal(r.taxBase, 150_000_000);
  assert.equal(r.computedTax, 20_000_000);
  assert.equal(r.total, 19_400_000);
});

test('혼인·출산 공제는 직계존속 증여가 아니면 적용하지 않는다', () => {
  const r = giftTax({ amount: 300_000_000, relation: 'spouse', marriageBirth: true });
  assert.equal(r.marriageBirth, false);
  assert.equal(r.deductionExtra, 0);
  assert.equal(r.taxBase, 0);
});

/* ── 과세최저한 ───────────────────────────────────────── */

test('과세표준 50만 원 미만이면 과세최저한으로 0원이다', () => {
  const r = giftTax({ amount: 50_400_000, relation: 'parentAdult' });
  assert.equal(r.taxBase, 400_000);
  assert.equal(r.belowMinimum, true);
  assert.equal(r.computedTax, 0);
  assert.equal(r.total, 0);
});

test('과세표준 정확히 50만 원이면 과세한다', () => {
  const r = giftTax({ amount: 50_500_000, relation: 'parentAdult' });
  assert.equal(r.taxBase, 500_000);
  assert.equal(r.belowMinimum, false);
  assert.equal(r.computedTax, 50_000);
  assert.equal(r.total, 48_500);
});

/* ── 10년 합산·기납부세액 ─────────────────────────────── */

test('10년 내 기증여액은 과세가액에 더하고 공제 한도는 그만큼 줄인다', () => {
  const r = giftTax({ amount: 500_000_000, relation: 'spouse', priorGift: 300_000_000 });
  assert.equal(r.taxableValue, 800_000_000);
  assert.equal(r.deductionBase, 300_000_000);
  assert.equal(r.taxBase, 500_000_000);
  assert.equal(r.computedTax, 90_000_000);
  assert.equal(r.total, 87_300_000);
  assert.equal(r.appliedBase, 300_000_000);
  assert.equal(r.remainingLimit, 0);
});

test('10년 내 기증여액이 1천만 원 미만이면 과세가액에 합산하지 않는다', () => {
  const r = giftTax({ amount: 100_000_000, relation: 'parentAdult', priorGift: 5_000_000 });
  assert.equal(r.taxableValue, 100_000_000);
  assert.equal(r.aggregateSkipped, true);
  assert.equal(r.deductionBase, 45_000_000);
  assert.equal(r.taxBase, 55_000_000);
  assert.equal(r.total, 5_335_000);
});

test('기납부세액은 산출세액+할증에서 빼고 나서 3% 공제를 적용한다', () => {
  const r = giftTax({ amount: 1_000_000_000, relation: 'spouse', priorTax: 10_000_000 });
  assert.equal(r.priorTax, 10_000_000);
  assert.equal(r.reportCredit, 1_800_000);
  assert.equal(r.total, 58_200_000);
});

test('신고세액공제를 끄면 3%가 빠지지 않는다', () => {
  const r = giftTax({ amount: 1_000_000_000, relation: 'spouse', reportDiscount: false });
  assert.equal(r.reportCredit, 0);
  assert.equal(r.total, 70_000_000);
});

/* ── 세대생략 할증 ────────────────────────────────────── */

test('세대생략 증여는 산출세액의 30%를 더한다', () => {
  const r = giftTax({
    amount: 1_000_000_000,
    relation: 'parentAdult',
    generationSkip: true,
  });
  assert.equal(r.taxBase, 950_000_000);
  assert.equal(r.computedTax, 225_000_000);
  assert.equal(r.skipRate, 0.3);
  assert.equal(r.surcharge, 67_500_000);
  assert.equal(r.total, 283_725_000);
});

test('미성년자가 20억 원을 넘겨 받으면 할증이 40%다', () => {
  const r = giftTax({
    amount: 2_100_000_000,
    relation: 'parentMinor',
    generationSkip: true,
  });
  assert.equal(r.taxBase, 2_080_000_000);
  assert.equal(r.computedTax, 672_000_000);
  assert.equal(r.skipRate, 0.4);
  assert.equal(r.surcharge, 268_800_000);
  assert.equal(r.total, 912_576_000);
});

test('미성년자라도 20억 원 이하면 할증은 30%다', () => {
  const r = giftTax({
    amount: 1_500_000_000,
    relation: 'parentMinor',
    generationSkip: true,
  });
  assert.equal(r.skipRate, 0.3);
});

test('20억 판단은 10년 합산이 아니라 이번 증여재산가액으로 한다', () => {
  const r = giftTax({
    amount: 1_500_000_000,
    relation: 'parentMinor',
    priorGift: 600_000_000,
    generationSkip: true,
  });
  assert.equal(r.taxableValue, 2_100_000_000);
  assert.equal(r.skipRate, 0.3);
});

/* ── 세율 구간 ────────────────────────────────────────── */

test('세율 구간과 누진공제가 법정 표와 같다', () => {
  assert.equal(bracketFor(100_000_000).rate, 0.1);
  assert.equal(bracketFor(100_000_001).progressive, 10_000_000);
  assert.equal(bracketFor(500_000_000).progressive, 10_000_000);
  assert.equal(bracketFor(500_000_001).progressive, 60_000_000);
  assert.equal(bracketFor(1_000_000_000).progressive, 60_000_000);
  assert.equal(bracketFor(1_000_000_001).progressive, 160_000_000);
  assert.equal(bracketFor(3_000_000_000).progressive, 160_000_000);
  assert.equal(bracketFor(3_000_000_001).rate, 0.5);
  assert.equal(bracketFor(3_000_000_001).progressive, 460_000_000);
});

test('증여액이 0이면 0원으로 안전하게 계산한다', () => {
  const r = giftTax({ amount: 0, relation: 'spouse' });
  assert.equal(r.taxableValue, 0);
  assert.equal(r.deduction, 0);
  assert.equal(r.total, 0);
  assert.equal(r.effectiveRate, 0);
});

/* ── 배우자 증여 절세 비교 ────────────────────────────── */

test('배우자 공제 안이면 증여세 0원, 양도세를 그대로 아낀다', () => {
  const c = compareSpouseGift({ value: 300_000_000, costBasis: 100_000_000 });
  assert.equal(c.gainA, 200_000_000);
  assert.equal(c.baseA, 197_500_000);
  assert.equal(c.taxA, 43_450_000);
  assert.equal(c.gift.total, 0);
  assert.equal(c.totalB, 0);
  assert.equal(c.saving, 43_450_000);
});

test('평가액이 6억을 넘으면 증여세를 내고도 절세된다', () => {
  const c = compareSpouseGift({ value: 800_000_000, costBasis: 200_000_000 });
  assert.equal(c.taxA, 131_450_000);
  assert.equal(c.gift.taxBase, 200_000_000);
  assert.equal(c.gift.total, 29_100_000);
  assert.equal(c.saving, 102_350_000);
});

test('1년 안에 팔면 이월과세로 취득가액이 되돌아가 오히려 손해다', () => {
  const c = compareSpouseGift({ value: 800_000_000, costBasis: 200_000_000 });
  assert.equal(c.gainEarly, 570_900_000);
  assert.equal(c.baseEarly, 568_400_000);
  assert.equal(c.taxEarly, 125_048_000);
  assert.equal(c.totalEarly, 154_148_000);
  assert.ok(c.totalEarly > c.taxA);
});

test('차익이 작으면 증여세가 더 비쌀 수 있다', () => {
  const c = compareSpouseGift({ value: 700_000_000, costBasis: 690_000_000 });
  assert.equal(c.taxA, 1_650_000);
  assert.equal(c.gift.total, 9_700_000);
  assert.equal(c.saving, -8_050_000);
});

test('필요경비와 기증여액이 비교에 반영된다', () => {
  const c = compareSpouseGift({
    value: 800_000_000,
    costBasis: 200_000_000,
    expenses: 5_000_000,
    priorGift: 500_000_000,
  });
  assert.equal(c.gainA, 595_000_000);
  assert.equal(c.baseA, 592_500_000);
  assert.equal(c.gift.taxableValue, 1_300_000_000);
  assert.equal(c.gift.deductionBase, 100_000_000);
  assert.equal(c.gift.taxBase, 1_200_000_000);
  assert.equal(c.gift.computedTax, 320_000_000);
  assert.equal(c.spouseRoom, 100_000_000);
});

test('평가액이 없으면 모두 0으로 계산한다', () => {
  const c = compareSpouseGift({ value: 0, costBasis: 0 });
  assert.equal(c.taxA, 0);
  assert.equal(c.totalB, 0);
  assert.equal(c.saving, 0);
  assert.equal(c.hasValue, false);
});

test('공제 상수는 2026년 기준값을 유지한다', () => {
  assert.equal(GIFT.marriageBirthDeduction, 100_000_000);
  assert.equal(GIFT.minTaxableBase, 500_000);
  assert.equal(GIFT.reportDiscountRate, 0.03);
  assert.equal(GIFT.capitalGainDeduction, 2_500_000);
  assert.equal(GIFT.capitalGainRate, 0.22);
});

/* ── 기타친족 범위와 신고세액공제 경계 ─────────────────── */

test('기타친족: 4촌 이내 혈족·3촌 이내 인척, 10년 공제 1,000만 원', () => {
  assert.equal(RELATIONS.relative.limit, 10_000_000);

  const exact = giftTax({ amount: 10_000_000, relation: 'relative' });
  assert.equal(exact.taxBase, 0);
  assert.equal(exact.total, 0);

  // 공제를 1만 원 넘겨도 과세표준 1만 원 → 과세최저한(50만 원)으로 0원
  const justOver = giftTax({ amount: 10_010_000, relation: 'relative' });
  assert.equal(justOver.taxBase, 10_000);
  assert.equal(justOver.belowMinimum, true);
  assert.equal(justOver.total, 0);

  const taxable = giftTax({ amount: 15_000_000, relation: 'relative' });
  assert.equal(taxable.taxBase, 5_000_000);
  assert.equal(taxable.computedTax, 500_000);
  assert.equal(taxable.reportCredit, 15_000);
  assert.equal(taxable.total, 485_000);
});

test('성인 자녀 1억 원 증여는 기본공제만 쓰면 485만 원이 부과된다', () => {
  const r = giftTax({ amount: 100_000_000, relation: 'parentAdult' });
  assert.equal(r.deduction, 50_000_000);
  assert.equal(r.taxBase, 50_000_000);
  assert.equal(r.computedTax, 5_000_000);
  assert.equal(r.reportCredit, 150_000);
  assert.equal(r.total, 4_850_000);
});

test('혼인·출산 공제를 함께 쓰면 1억 5,000만 원까지 0원이다', () => {
  const r = giftTax({ amount: 150_000_000, relation: 'parentAdult', marriageBirth: true });
  assert.equal(r.deduction, 150_000_000);
  assert.equal(r.taxBase, 0);
  assert.equal(r.total, 0);
});
