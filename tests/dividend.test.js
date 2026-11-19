import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calcDividend,
  basicIncomeTax,
  bracketFor,
  FINANCIAL_THRESHOLD,
} from '../src/dividend.js';

test('국내 배당은 15.4% 원천징수로 종결된다', () => {
  const r = calcDividend({ domestic: 10_000_000 });
  assert.equal(r.mode, 'separate');
  assert.equal(r.financial, 10_000_000);
  assert.equal(r.domesticTax, 1_540_000);
  assert.equal(r.totalTax, 1_540_000);
  assert.equal(r.netReceipt, 8_460_000);
  assert.ok(Math.abs(r.effectiveRate - 0.154) < 1e-9);
});

test('미국 배당은 현지 15%만 부담하고 국내 추가 징수는 없다', () => {
  const r = calcDividend({ us: 10_000_000 });
  assert.equal(r.usTax, 1_500_000);
  assert.equal(r.usTopUp, 0);
  assert.equal(r.domesticTax, 0);
  assert.equal(r.totalTax, 1_500_000);
  assert.ok(Math.abs(r.effectiveRate - 0.15) < 1e-9);
});

test('국내 이자와 배당은 합산해 15.4%', () => {
  const r = calcDividend({ domestic: 6_000_000, interest: 4_000_000 });
  assert.equal(r.financial, 10_000_000);
  assert.equal(r.domesticTax, 1_540_000);
});

test('금융소득 정확히 2,000만 원은 종합과세 대상이 아니다', () => {
  const r = calcDividend({ domestic: 20_000_000 });
  assert.equal(r.financial, FINANCIAL_THRESHOLD);
  assert.equal(r.exceeded, false);
  assert.equal(r.totalTax, 3_080_000);
});

test('2,000만 원을 넘으면 비교과세 중 큰 금액이 적용된다', () => {
  const r = calcDividend({ domestic: 21_000_000 });
  assert.equal(r.mode, 'combined');
  assert.equal(r.exceeded, true);
  assert.equal(r.excess, 1_000_000);
  assert.equal(r.methodA, 2_860_000); // 280만 + 100만×6%
  assert.equal(r.methodB, 2_940_000); // 2,100만×14%
  assert.equal(r.methodApplied, 'flat');
  assert.equal(r.nationalTax, 2_940_000);
  assert.equal(r.localTax, 294_000);
  assert.equal(r.koreanTax, 3_234_000);
  assert.equal(r.additional, 0); // 원천징수 15.4%로 이미 낸 만큼
});

test('다른 소득이 있으면 초과분이 그 사람의 한계세율로 계산된다', () => {
  const r = calcDividend({ domestic: 30_000_000, otherIncome: 50_000_000 });
  assert.equal(r.methodApplied, 'combined');
  assert.equal(r.methodA, 11_440_000); // 280만 + basicTax(6,000만)=864만
  assert.equal(r.methodB, 10_440_000); // 420만 + basicTax(5,000만)=624만
  assert.equal(r.nationalTax, 11_440_000);
  assert.equal(r.localTax, 1_144_000);
  assert.equal(r.prepaid, 4_620_000);
  assert.equal(r.additional, 7_964_000);
  assert.equal(r.bracket.rate, 0.24);
});

test('미국 배당의 외국납부세액공제는 소득 비중 한도까지만 적용된다', () => {
  const r = calcDividend({ domestic: 15_000_000, us: 6_000_000 });
  assert.equal(r.financial, 21_000_000);
  assert.equal(r.usTax, 900_000);
  assert.equal(r.foreignCreditLimit, 840_000); // 294만 × 600/2,100
  assert.equal(r.foreignCredit, 840_000);
  assert.equal(r.nationalTax - r.foreignCredit, 2_100_000);
  assert.equal(r.koreanTax, 2_310_000);
  assert.equal(r.totalTax, 3_210_000); // 국내 231만 + 미국 90만
});

test('소득공제를 반영하면 초과분 과세표준이 줄어든다', () => {
  const without = calcDividend({ domestic: 30_000_000, otherIncome: 50_000_000 });
  const withDeduction = calcDividend({
    domestic: 30_000_000,
    otherIncome: 50_000_000,
    deductions: 5_000_000,
  });
  assert.equal(withDeduction.combinedBase, without.combinedBase - 5_000_000);
  assert.ok(withDeduction.nationalTax < without.nationalTax);
});

test('피부양자 판정은 금융소득 1,000만 원 초과부터 전액 합산한다', () => {
  const small = calcDividend({ domestic: 9_000_000 });
  assert.equal(small.dependent.countedFinancial, 0);
  assert.equal(small.dependent.risk, false);

  const over = calcDividend({ domestic: 12_000_000 });
  assert.equal(over.dependent.countedFinancial, 12_000_000);
  assert.equal(over.dependent.risk, false);

  const risky = calcDividend({ domestic: 12_000_000, otherIncome: 10_000_000 });
  assert.equal(risky.dependent.incomeTotal, 22_000_000);
  assert.equal(risky.dependent.risk, true);
});

test('기본세율표는 2026년 8구간과 일치한다', () => {
  assert.equal(bracketFor(14_000_000).rate, 0.06);
  assert.equal(bracketFor(14_000_001).rate, 0.15);
  assert.equal(bracketFor(50_000_000).rate, 0.15);
  assert.equal(bracketFor(88_000_000).rate, 0.24);
  assert.equal(bracketFor(150_000_000).rate, 0.35);
  assert.equal(bracketFor(300_000_000).rate, 0.38);
  assert.equal(bracketFor(500_000_000).rate, 0.4);
  assert.equal(bracketFor(1_000_000_000).rate, 0.42);
  assert.equal(bracketFor(2_000_000_000).rate, 0.45);
  assert.equal(basicIncomeTax(60_000_000), 8_640_000); // 24% 구간
  assert.equal(basicIncomeTax(50_000_000), 6_240_000); // 15% 구간 상단
  assert.equal(basicIncomeTax(0), 0);
});

test('입력이 비어 있으면 0원으로 계산한다', () => {
  const r = calcDividend({});
  assert.equal(r.financial, 0);
  assert.equal(r.totalTax, 0);
  assert.equal(r.effectiveRate, 0);
});
