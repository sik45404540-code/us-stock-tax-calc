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
  assert.equal(r.grossUpBase, 1_000_000); // 초과분에 들어간 배당만 가산 대상
  assert.equal(r.grossUp, 100_000);
  assert.equal(r.methodA, 2_866_000); // 280만 + basicTax(1,100만)=66만
  assert.equal(r.methodB, 2_940_000); // 2,100만×14%
  assert.equal(r.methodApplied, 'flat');
  assert.equal(r.dividendCredit, 0); // ②가 크면 공제 없음
  assert.equal(r.nationalTax, 2_940_000);
  assert.equal(r.localTax, 294_000);
  assert.equal(r.koreanTax, 3_234_000);
  assert.equal(r.additional, 0); // 원천징수 15.4%로 이미 낸 만큼
});

test('배당 Gross-up 예시: 국내 배당 3,000만 + 근로소득금액 5,000만 → 국세 1,068만 원', () => {
  const r = calcDividend({ domestic: 30_000_000, otherIncome: 50_000_000 });
  assert.equal(r.financial, 30_000_000);
  assert.equal(r.excess, 10_000_000);
  assert.equal(r.grossUpBase, 10_000_000);
  assert.equal(r.grossUp, 1_000_000); // 배당가산 10% = 100만 원
  assert.equal(r.methodA, 11_680_000); // 280만 + basicTax(6,100만)=888만
  assert.equal(r.methodB, 10_440_000); // 420만 + basicTax(5,000만)=624만
  assert.equal(r.methodApplied, 'combined');
  assert.equal(r.dividendCredit, 1_000_000); // min(가산액 100만, ①−② 124만)
  assert.equal(r.nationalTax, 10_680_000);
  assert.equal(r.localTax, 1_068_000);
  assert.equal(r.koreanTax, 11_748_000);
  assert.equal(r.prepaid, 4_620_000);
  assert.equal(r.additional, 7_128_000);
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

/* ── 배당가산(Gross-up)과 배당세액공제 ─────────────────── */

test('배당가산: ETF·리츠·펀드 분배금은 가산 대상이 아니다', () => {
  const r = calcDividend({ domesticExcluded: 30_000_000, otherIncome: 50_000_000 });
  assert.equal(r.financial, 30_000_000);
  assert.equal(r.grossUpBase, 0);
  assert.equal(r.grossUp, 0);
  assert.equal(r.methodA, 11_440_000); // 280만 + basicTax(6,000만)=864만
  assert.equal(r.dividendCredit, 0);
  assert.equal(r.nationalTax, 11_440_000);
  assert.equal(r.additional, 7_964_000);
});

test('배당가산: 대상 금액은 2,000만 원 초과분까지만 잡는다', () => {
  const r = calcDividend({ domestic: 50_000_000 });
  assert.equal(r.excess, 30_000_000);
  assert.equal(r.grossUpBase, 30_000_000);
  assert.equal(r.grossUp, 3_000_000);
  assert.equal(r.methodA, 6_490_000); // 280만 + basicTax(3,300만)=369만
  assert.equal(r.methodB, 7_000_000); // 5,000만×14% → ②가 커서 공제 없음
  assert.equal(r.dividendCredit, 0);
  assert.equal(r.nationalTax, 7_000_000);
  assert.equal(r.additional, 0);
});

test('배당가산: 기준금액은 이자가 먼저 채우고 배당은 남은 초과분만 가산한다', () => {
  const r = calcDividend({ interest: 10_000_000, domestic: 30_000_000 });
  assert.equal(r.financial, 40_000_000);
  assert.equal(r.excess, 20_000_000);
  assert.equal(r.grossUpBase, 10_000_000); // 이자 1,000만이 먼저 채운 뒤 남은 1,000만
  assert.equal(r.grossUp, 1_000_000);
});

test('미국 배당이 기준금액을 채우면 국내 배당 가산액은 줄어든다', () => {
  const r = calcDividend({ us: 15_000_000, domestic: 10_000_000 });
  assert.equal(r.financial, 25_000_000);
  assert.equal(r.excess, 5_000_000);
  assert.equal(r.grossUpBase, 0); // 초과분 500만이 전부 미국 배당에서 나온다
  assert.equal(r.grossUp, 0);
  assert.equal(r.dividendCredit, 0);
});

test('2,000만 원 이하에서는 배당가산·배당세액공제가 없다', () => {
  const r = calcDividend({ domestic: 20_000_000 });
  assert.equal(r.mode, 'separate');
  assert.equal(r.grossUpBase, 0);
  assert.equal(r.grossUp, 0);
  assert.equal(r.dividendCredit, 0);
});
