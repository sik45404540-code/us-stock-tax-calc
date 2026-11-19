import test from 'node:test';
import assert from 'node:assert/strict';

import { calcPension, PENSION, INCOME_TYPES } from '../src/pension.js';

test('연금저축 600만 + IRP 300만, 총급여 5,500만 원 이하 → 15%로 148만 5천 원', () => {
  const r = calcPension({ incomeType: 'salary', income: 50_000_000, pension: 6_000_000, irp: 3_000_000 });
  assert.equal(r.creditBase, 9_000_000);
  assert.equal(r.incomeTaxCredit, 1_350_000);
  assert.equal(r.localTaxCredit, 135_000);
  assert.equal(r.totalCredit, 1_485_000);
  assert.equal(r.rate, 0.15);
});

test('총급여 5,500만 원 초과는 12%, 지방세 포함 13.2%', () => {
  const over = calcPension({ incomeType: 'salary', income: 55_010_000, pension: 6_000_000, irp: 3_000_000 });
  assert.equal(over.rate, 0.12);
  assert.equal(over.incomeTaxCredit, 1_080_000);
  assert.equal(over.localTaxCredit, 108_000);
  assert.equal(over.totalCredit, 1_188_000);
});

test('경계값: 총급여 5,500만 원은 15%, 1원 넘으면 12%', () => {
  const at = calcPension({ incomeType: 'salary', income: 55_000_000, pension: 6_000_000 });
  assert.equal(at.isLowRate, true);
  assert.equal(at.rate, 0.15);

  const justOver = calcPension({ incomeType: 'salary', income: 55_000_001, pension: 6_000_000 });
  assert.equal(justOver.isLowRate, false);
  assert.equal(justOver.rate, 0.12);
});

test('종합소득금액은 4,500만 원이 기준선이다', () => {
  const at = calcPension({ incomeType: 'total', income: 45_000_000, pension: 6_000_000 });
  assert.equal(at.threshold, 45_000_000);
  assert.equal(at.rate, 0.15);

  const over = calcPension({ incomeType: 'total', income: 45_000_001, pension: 6_000_000 });
  assert.equal(over.rate, 0.12);

  // 총급여 5,500만 원이어도 종합소득금액 기준이면 4,500만 원 초과로 12%
  const salaryOverTotal = calcPension({ incomeType: 'total', income: 55_000_000, pension: 6_000_000 });
  assert.equal(salaryOverTotal.rate, 0.12);
});

test('연금저축에만 900만 원을 넣으면 600만 원까지만 공제된다', () => {
  const r = calcPension({ incomeType: 'salary', income: 50_000_000, pension: 9_000_000 });
  assert.equal(r.pensionApplied, 6_000_000);
  assert.equal(r.irpApplied, 0);
  assert.equal(r.creditBase, 6_000_000);
  assert.equal(r.incomeTaxCredit, 900_000);
  assert.equal(r.localTaxCredit, 90_000);
  assert.equal(r.totalCredit, 990_000);
  assert.equal(r.pensionExcess, 3_000_000);
});

test('IRP에만 900만 원을 넣어도 900만 원 모두 공제 대상이다', () => {
  const r = calcPension({ incomeType: 'salary', income: 50_000_000, irp: 9_000_000 });
  assert.equal(r.pensionApplied, 0);
  assert.equal(r.irpApplied, 9_000_000);
  assert.equal(r.creditBase, 9_000_000);
});

test('연금저축 800만 + IRP 300만 → 900만 원에서 잘리고 200만 원이 빠진다', () => {
  const r = calcPension({ incomeType: 'salary', income: 50_000_000, pension: 8_000_000, irp: 3_000_000 });
  assert.equal(r.pensionApplied, 6_000_000);
  assert.equal(r.irpApplied, 3_000_000);
  assert.equal(r.creditBase, 9_000_000);
  assert.equal(r.pensionExcess, 2_000_000);
  assert.equal(r.irpExcess, 0);
});

test('ISA 전환은 900만 원을 채운 상태에서 최대 300만 원을 더해 1,200만 원까지', () => {
  const r = calcPension({
    incomeType: 'salary', income: 50_000_000,
    pension: 6_000_000, irp: 3_000_000, isaTransfer: 30_000_000,
  });
  assert.equal(r.isaExtraLimit, 3_000_000);
  assert.equal(r.isaInBasic, 0);
  assert.equal(r.isaInExtra, 3_000_000);
  assert.equal(r.creditBase, 12_000_000);
  assert.equal(r.incomeTaxCredit, 1_800_000);
  assert.equal(r.localTaxCredit, 180_000);
  assert.equal(r.totalCredit, 1_980_000);
  assert.equal(r.isaExcess, 27_000_000);
});

test('ISA 전환금액은 900만 원의 빈자리를 먼저 채운다', () => {
  // 연금저축 300만 + ISA 전환 1,000만 → 기본 600만 자리 + 추가 100만 = 1,000만
  const r = calcPension({ incomeType: 'salary', income: 50_000_000, pension: 3_000_000, isaTransfer: 10_000_000 });
  assert.equal(r.basicRoom, 6_000_000);
  assert.equal(r.isaInBasic, 6_000_000);
  assert.equal(r.isaExtraLimit, 1_000_000);
  assert.equal(r.isaInExtra, 1_000_000);
  assert.equal(r.creditBase, 10_000_000);
  assert.equal(r.totalCredit, 1_650_000);
});

test('ISA 전환만 100만 원이면 추가 한도 없이 100만 원 전액이 공제 대상', () => {
  const r = calcPension({ incomeType: 'salary', income: 50_000_000, isaTransfer: 1_000_000 });
  assert.equal(r.isaExtraLimit, 100_000);
  assert.equal(r.isaInBasic, 1_000_000);
  assert.equal(r.isaInExtra, 0);
  assert.equal(r.creditBase, 1_000_000);
  assert.equal(r.isaExcess, 0);
});

test('ISA 전환 추가 한도는 300만 원에서 멈춘다', () => {
  const r = calcPension({ incomeType: 'salary', income: 50_000_000, isaTransfer: 100_000_000 });
  assert.equal(r.isaExtraLimit, 3_000_000);
  assert.equal(r.creditBase, 12_000_000);
});

test('공제 한도 초과분은 경고가 아닌 중립 안내로 남긴다', () => {
  const r = calcPension({ incomeType: 'salary', income: 50_000_000, pension: 9_000_000 });
  const note = r.notes.find((n) => n.level === 'note');
  assert.equal(Boolean(note), true);
  assert.match(note.text, /과세이연/);
  assert.match(note.text, /다음 해 이후 전환 신청/);
  assert.equal(r.notes.some((n) => n.level === 'warn'), false);
});

test('연금계좌 납입한도 1,800만 원 초과는 따로 경고한다', () => {
  const over = calcPension({ incomeType: 'salary', income: 50_000_000, pension: 9_000_000, irp: 10_000_000 });
  assert.equal(over.contributionTotal, 19_000_000);
  assert.equal(over.contributionOver, 1_000_000);
  assert.equal(over.notes.some((n) => n.level === 'warn' && /1,800만/.test(n.text)), true);
});

test('ISA 전환금액은 1,800만 원 납입한도에 넣지 않는다', () => {
  const r = calcPension({
    incomeType: 'salary', income: 50_000_000,
    pension: 9_000_000, irp: 9_000_000, isaTransfer: 30_000_000,
  });
  assert.equal(r.contributionTotal, 18_000_000);
  assert.equal(r.contributionOver, 0);
  assert.equal(r.creditBase, 12_000_000);
});

test('납입액이 없으면 공제액도 0원이다', () => {
  const r = calcPension({ incomeType: 'salary', income: 50_000_000 });
  assert.equal(r.creditBase, 0);
  assert.equal(r.totalCredit, 0);
  assert.equal(r.hasInput, false);
  assert.equal(r.baseUsedPct, 0);
});

test('숫자 문자열·쉼표·잘못된 입력을 안전하게 처리한다', () => {
  const r = calcPension({
    incomeType: 'salary', income: '50,000,000', pension: '6,000,000원', irp: '3,000,000', isaTransfer: null,
  });
  assert.equal(r.income, 50_000_000);
  assert.equal(r.pension, 6_000_000);
  assert.equal(r.creditBase, 9_000_000);

  const bad = calcPension({ incomeType: 'unknown', income: 'abc', pension: undefined });
  assert.equal(bad.incomeType, 'salary');
  assert.equal(bad.income, 0);
  assert.equal(bad.totalCredit, 0);
});

test('상수는 2026년 귀속 기준과 일치한다', () => {
  assert.equal(PENSION.pensionCap, 6_000_000);
  assert.equal(PENSION.combinedCap, 9_000_000);
  assert.equal(PENSION.contributionCap, 18_000_000);
  assert.equal(PENSION.isaConversionRate, 0.1);
  assert.equal(PENSION.isaExtraCap, 3_000_000);
  assert.equal(PENSION.totalCap, 12_000_000);
  assert.equal(PENSION.rateLow, 0.15);
  assert.equal(PENSION.rateHigh, 0.12);
  assert.equal(PENSION.localRate, 0.1);
  assert.equal(INCOME_TYPES.salary.threshold, 55_000_000);
  assert.equal(INCOME_TYPES.total.threshold, 45_000_000);
});
