import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calcYearend,
  earnedIncomeDeduction,
  computedTax,
  laborTaxCredit,
  laborCreditCap,
  childTaxCredit,
  estimateInsurance,
  cardDeduction,
  medicalCredit,
  educationCredit,
  donationCredit,
  YE,
} from '../src/yearend.js';

// ── 근로소득공제 (소득세법 제47조, 한도 2,000만 원) ─────────────────────────
test('근로소득공제: 총급여 구간별 산식', () => {
  assert.equal(earnedIncomeDeduction(3_000_000), 2_100_000);
  assert.equal(earnedIncomeDeduction(5_000_000), 3_500_000);
  assert.equal(earnedIncomeDeduction(10_000_000), 5_500_000);
  assert.equal(earnedIncomeDeduction(30_000_000), 9_750_000);
  assert.equal(earnedIncomeDeduction(33_800_000), 10_320_000);
  assert.equal(earnedIncomeDeduction(50_000_000), 12_250_000);
  assert.equal(earnedIncomeDeduction(100_000_000), 14_750_000);
});

test('근로소득공제: 총급여 3억 6,250만 원부터 2,000만 원 한도', () => {
  assert.equal(earnedIncomeDeduction(362_500_000), 20_000_000);
  assert.equal(earnedIncomeDeduction(500_000_000), 20_000_000);
  assert.equal(earnedIncomeDeduction(0), 0);
});

// ── 기본세율 8구간 (소득세법 제55조) ─────────────────────────────────────────
test('산출세액: 구간 경계에서 누진공제가 이어진다', () => {
  assert.equal(computedTax(14_000_000), 840_000);
  assert.equal(computedTax(14_000_001), 840_000);
  assert.equal(computedTax(50_000_000), 6_240_000);
  assert.equal(computedTax(88_000_000), 15_360_000);
  assert.equal(computedTax(150_000_000), 37_060_000);
  assert.equal(computedTax(300_000_000), 94_060_000);
  assert.equal(computedTax(500_000_000), 174_060_000);
  assert.equal(computedTax(1_000_000_000), 384_060_000);
  assert.equal(computedTax(1_300_000_000), 519_060_000);
  assert.equal(computedTax(0), 0);
});

// ── 근로소득세액공제 ─────────────────────────────────────────────────────
test('근로소득세액공제: 130만 원 이하 55%, 초과분 30%', () => {
  assert.equal(laborTaxCredit(900_000, 30_000_000), 495_000);
  assert.equal(laborTaxCredit(1_300_000, 30_000_000), 715_000);
});

test('근로소득세액공제: 총급여별 한도 74만·66만·50만·20만 원', () => {
  assert.equal(laborCreditCap(30_000_000), 740_000);
  assert.equal(laborCreditCap(33_000_000), 740_000);
  assert.equal(laborCreditCap(40_000_000), 684_000);
  assert.equal(laborCreditCap(43_000_000), 660_000);
  assert.equal(laborCreditCap(60_000_000), 660_000);
  assert.equal(laborCreditCap(71_000_000), 500_000);
  assert.equal(laborCreditCap(120_000_000), 500_000);
  assert.equal(laborCreditCap(130_000_000), 200_000);
});

test('근로소득세액공제: 한도가 공제액보다 작으면 한도만', () => {
  assert.equal(laborTaxCredit(2_000_000, 60_000_000), 660_000);
  assert.equal(laborTaxCredit(3_000_000, 40_000_000), 684_000);
  assert.equal(laborTaxCredit(0, 50_000_000), 0);
});

// ── 자녀세액공제 ────────────────────────────────────────────────────────
test('자녀세액공제: 1명 25만·2명 55만·3명부터 1명당 40만 원 추가', () => {
  assert.equal(childTaxCredit(0), 0);
  assert.equal(childTaxCredit(1), 250_000);
  assert.equal(childTaxCredit(2), 550_000);
  assert.equal(childTaxCredit(3), 950_000);
  assert.equal(childTaxCredit(4), 1_350_000);
});

// ── 4대보험료 추정 ───────────────────────────────────────────────────────
test('4대보험료: 총급여 5,000만 원 추정', () => {
  const r = estimateInsurance(50_000_000);
  assert.equal(r.nps, 2_375_000);
  assert.equal(r.health, 1_797_500);
  assert.equal(r.ltc, 236_191);
  assert.equal(r.employment, 450_000);
  assert.equal(r.total, 4_858_691);
});

test('4대보험료: 국민연금은 기준소득월액 상한에 걸린다', () => {
  const r = estimateInsurance(100_000_000);
  // 6개월 × 637만 + 6개월 × 659만 × 4.75%
  assert.equal(r.nps, 3_693_600);
  assert.equal(r.health, 3_595_000);
  assert.equal(r.capped, true);
});

// ── 신용카드 소득공제 ────────────────────────────────────────────────────
test('신용카드: 총급여 25% 문턱을 낮은 공제율부터 채운다', () => {
  const r = cardDeduction({
    creditCard: 12_000_000, debit: 6_000_000, market: 600_000, transit: 1_200_000,
  }, 50_000_000, 1);
  assert.equal(r.threshold, 12_500_000);
  assert.equal(r.creditBase, 2_370_000);
  assert.equal(r.baseLimit, 3_500_000);
  assert.equal(r.total, 2_370_000);
});

test('신용카드: 사용액이 문턱에 못 미치면 공제 0원', () => {
  const r = cardDeduction({ creditCard: 5_000_000 }, 50_000_000, 0);
  assert.equal(r.total, 0);
  assert.equal(r.shortfall, 7_500_000);
});

test('신용카드: 신용카드만 쓰면 15%로 기본한도까지만', () => {
  const r = cardDeduction({ creditCard: 20_000_000 }, 50_000_000, 0);
  assert.equal(r.creditBase, 1_125_000);
  assert.equal(r.total, 1_125_000);
});

test('신용카드: 자녀 수에 따라 기본한도가 늘어난다', () => {
  assert.equal(cardDeduction({ creditCard: 20_000_000 }, 50_000_000, 1).baseLimit, 3_500_000);
  assert.equal(cardDeduction({ creditCard: 20_000_000 }, 50_000_000, 2).baseLimit, 4_000_000);
  assert.equal(cardDeduction({ creditCard: 20_000_000 }, 80_000_000, 1).baseLimit, 2_750_000);
});

test('신용카드: 전통시장·대중교통 추가한도는 300만 원(7,000만 원 초과는 200만 원)', () => {
  const r = cardDeduction({
    creditCard: 20_000_000, debit: 10_000_000, market: 5_000_000, transit: 5_000_000,
  }, 50_000_000, 0);
  assert.equal(r.creditBase, 8_125_000);
  assert.equal(r.general, 3_000_000);
  assert.equal(r.extra, 3_000_000);
  assert.equal(r.total, 6_000_000);

  const high = cardDeduction({
    creditCard: 40_000_000, debit: 20_000_000, market: 10_000_000, transit: 10_000_000,
  }, 80_000_000, 0);
  assert.equal(high.extraLimit, 2_000_000);
  assert.equal(high.total, 4_500_000);
});

test('신용카드: 문화체육 사용분은 총급여 7,000만 원 이하만 30%', () => {
  const low = cardDeduction({ creditCard: 30_000_000, culture: 3_000_000 }, 60_000_000, 0);
  const high = cardDeduction({ creditCard: 30_000_000, culture: 3_000_000 }, 80_000_000, 0);
  assert.ok(low.creditBase > high.creditBase);
  assert.equal(high.cultureEligible, false);
});

// ── 월세·연금계좌 ────────────────────────────────────────────────────────
test('월세: 총급여 5,500만 원 이하 17%, 초과 15%, 1,000만 원 한도', () => {
  const low = calcYearend({ salary: 50_000_000, rent: 6_000_000, rentEligible: true, paidTax: 0 });
  assert.equal(low.credits.rent.credit, 1_020_000);

  const high = calcYearend({ salary: 60_000_000, rent: 6_000_000, rentEligible: true, paidTax: 0 });
  assert.equal(high.credits.rent.credit, 900_000);

  const capped = calcYearend({ salary: 40_000_000, rent: 12_000_000, rentEligible: true, paidTax: 0 });
  assert.equal(capped.credits.rent.base, 10_000_000);
  assert.equal(capped.credits.rent.credit, 1_700_000);
});

test('월세: 총급여 8,000만 원 초과나 요건 미충족이면 0원', () => {
  assert.equal(calcYearend({ salary: 80_000_001, rent: 6_000_000, rentEligible: true, paidTax: 0 }).credits.rent.credit, 0);
  assert.equal(calcYearend({ salary: 50_000_000, rent: 6_000_000, rentEligible: false, paidTax: 0 }).credits.rent.credit, 0);
});

test('연금계좌: 600만·900만 원 한도와 15%·12%', () => {
  const low = calcYearend({ salary: 50_000_000, pensionSavings: 4_000_000, irp: 2_000_000, paidTax: 0 });
  assert.equal(low.credits.pension.base, 6_000_000);
  assert.equal(low.credits.pension.credit, 900_000);

  const high = calcYearend({ salary: 60_000_000, pensionSavings: 6_000_000, irp: 3_000_000, paidTax: 0 });
  assert.equal(high.credits.pension.base, 9_000_000);
  assert.equal(high.credits.pension.credit, 1_080_000);

  const pensionOnly = calcYearend({ salary: 50_000_000, pensionSavings: 9_000_000, paidTax: 0 });
  assert.equal(pensionOnly.credits.pension.base, 6_000_000);

  const irpOnly = calcYearend({ salary: 50_000_000, irp: 9_000_000, paidTax: 0 });
  assert.equal(irpOnly.credits.pension.base, 9_000_000);
});

// ── 의료비 ──────────────────────────────────────────────────────────────
test('의료비: 총급여 3% 문턱을 넘는 금액에 15%', () => {
  const below = medicalCredit({ family: 1_000_000, unlimited: 0 }, 50_000_000);
  assert.equal(below.threshold, 1_500_000);
  assert.equal(below.credit, 0);

  const self = medicalCredit({ family: 0, unlimited: 2_000_000 }, 50_000_000);
  assert.equal(self.base, 500_000);
  assert.equal(self.credit, 75_000);

  const mixed = medicalCredit({ family: 1_000_000, unlimited: 2_000_000 }, 50_000_000);
  assert.equal(mixed.base, 1_500_000);
  assert.equal(mixed.credit, 225_000);
});

test('의료비: 일반 부양가족 의료비는 700만 원 한도', () => {
  const r = medicalCredit({ family: 10_000_000, unlimited: 0 }, 50_000_000);
  assert.equal(r.familyBase, 7_000_000);
  assert.equal(r.credit, 1_050_000);
});

// ── 교육비 ──────────────────────────────────────────────────────────────
test('교육비: 자녀 1명당 300만·대학생 900만 원, 본인 한도 없음', () => {
  const one = educationCredit({ kids: 5_000_000, collegeCount: 0, self: 0 }, 1);
  assert.equal(one.limit, 3_000_000);
  assert.equal(one.credit, 450_000);
  assert.equal(one.overLimit, 2_000_000);

  const college = educationCredit({ kids: 12_000_000, collegeCount: 1, self: 0 }, 1);
  assert.equal(college.limit, 9_000_000);
  assert.equal(college.credit, 1_350_000);

  const self = educationCredit({ kids: 0, collegeCount: 0, self: 2_000_000 }, 0);
  assert.equal(self.credit, 300_000);
});

// ── 기부금 ──────────────────────────────────────────────────────────────
test('기부금: 1,000만 원까지 15%, 초과분 30%', () => {
  const r = donationCredit({ general: 12_000_000 }, 37_750_000);
  assert.equal(r.limit, 11_325_000);
  assert.equal(r.allowed, 11_325_000);
  assert.equal(r.credit, 1_897_500);

  const small = donationCredit({ general: 1_500_000 }, 37_750_000);
  assert.equal(small.credit, 225_000);
});

test('기부금: 종교단체가 있으면 한도가 10%+20%로 낮아진다', () => {
  const r = donationCredit({ general: 4_000_000, religion: 500_000 }, 37_750_000);
  assert.equal(r.limit, 7_775_000);
  assert.equal(r.allowed, 4_500_000);
  assert.equal(r.credit, 675_000);
});

test('고향사랑기부금: 10만 원 100/110, 10~20만 40%, 초과분 15%', () => {
  const r = donationCredit({ hometown: 300_000 }, 37_750_000);
  assert.equal(r.hometownCredit, 145_909);
});

// ── 인적공제 ────────────────────────────────────────────────────────────
test('인적공제: 본인 포함 1명당 150만 원 + 경로·장애인 추가공제', () => {
  const r = calcYearend({
    salary: 50_000_000, dependents: 3, elder: 1, disabled: 1, paidTax: 0,
  });
  assert.equal(r.personal.basic, 4_500_000);
  assert.equal(r.personal.elder, 1_000_000);
  assert.equal(r.personal.disabled, 2_000_000);
  assert.equal(r.personal.total, 7_500_000);
});

test('인적공제: 부녀자는 소득 3,000만 원 이하, 한부모와 겹치면 한부모만', () => {
  const female = calcYearend({ salary: 30_000_000, deps: 2, female: true, paidTax: 0 });
  assert.equal(female.personal.female, 500_000);

  const over = calcYearend({ salary: 50_000_000, deps: 2, female: true, paidTax: 0 });
  assert.equal(over.personal.female, 0);

  const single = calcYearend({ salary: 30_000_000, deps: 2, female: true, singleParent: true, kids: 1, paidTax: 0 });
  assert.equal(single.personal.female, 0);
  assert.equal(single.personal.singleParent, 1_000_000);
});

// ── 전체 계산 ────────────────────────────────────────────────────────────
test('전체 계산: 예시(총급여 5,000만 원) 결정세액과 환급액', () => {
  const r = calcYearend({
    salary: 50_000_000,
    dependents: 3, kids: 1, kidsCredit: 1,
    creditCard: 12_000_000, debit: 6_000_000, market: 600_000, transit: 1_200_000,
    pensionSavings: 4_000_000, irp: 2_000_000,
    paidTax: 1_200_000,
  });
  assert.equal(r.earnedDeduction, 12_250_000);
  assert.equal(r.earnedIncome, 37_750_000);
  assert.equal(r.personal.total, 4_500_000);
  assert.equal(r.insurance.applied, 4_858_691);
  assert.equal(r.card.total, 2_370_000);
  assert.equal(r.deductionsTotal, 11_728_691);
  assert.equal(r.taxableBase, 26_021_309);
  assert.equal(r.computedTax, 2_643_196);
  assert.equal(r.credits.labor, 660_000);
  assert.equal(r.credits.child, 250_000);
  assert.equal(r.credits.pension.credit, 900_000);
  assert.equal(r.credits.total, 1_810_000);
  assert.equal(r.decidedTax, 833_196);
  assert.equal(r.incomeDelta, 366_804);
  assert.equal(r.localDelta, 36_681);
  assert.equal(r.totalDelta, 403_485);
  assert.equal(r.refund, true);
});

test('전체 계산: 세액공제가 산출세액을 넘으면 결정세액 0원', () => {
  const r = calcYearend({
    salary: 30_000_000,
    dependents: 1,
    pensionSavings: 6_000_000, irp: 3_000_000,
    paidTax: 800_000,
  });
  assert.equal(r.decidedTax, 0);
  assert.ok(r.credits.over > 0);
  assert.equal(r.incomeDelta, 800_000);
  assert.equal(r.totalDelta, 880_000);
});

test('전체 계산: 기납부세액이 적으면 마이너스(추가 납부)', () => {
  const r = calcYearend({ salary: 80_000_000, dependents: 1, paidTax: 0 });
  assert.ok(r.decidedTax > 0);
  assert.equal(r.incomeDelta, -r.decidedTax);
  assert.equal(r.refund, false);
  assert.ok(r.totalDelta < 0);
});

test('전체 계산: 4대보험료를 직접 입력하면 추정값 대신 쓴다', () => {
  const r = calcYearend({ salary: 50_000_000, insuranceOverride: 5_000_000, paidTax: 0 });
  assert.equal(r.insurance.applied, 5_000_000);
  assert.equal(r.insurance.estimated, false);
});

test('전체 계산: 입력이 0이면 공제·세액도 0', () => {
  const r = calcYearend({});
  assert.equal(r.salary, 0);
  assert.equal(r.computedTax, 0);
  assert.equal(r.decidedTax, 0);
  assert.equal(r.hasInput, false);
});

test('전체 계산: 공제가 근로소득금액을 넘으면 과세표준 0원', () => {
  const r = calcYearend({ salary: 20_000_000, dependents: 10, paidTax: 0 });
  assert.equal(r.earnedIncome, 11_750_000);
  assert.ok(r.deductionsTotal > r.earnedIncome);
  assert.equal(r.taxableBase, 0);
  assert.equal(r.computedTax, 0);
  assert.equal(r.decidedTax, 0);
});

// ── 혼인·출산 ────────────────────────────────────────────────────────────
test('혼인세액공제 50만 원, 출산·입양 첫째 30만·둘째 50만·셋째 70만 원', () => {
  const married = calcYearend({ salary: 50_000_000, marriage: true, paidTax: 0 });
  assert.equal(married.credits.marriage, YE.marriageCredit);

  assert.equal(calcYearend({ salary: 50_000_000, birth: 'first', paidTax: 0 }).credits.birth, 300_000);
  assert.equal(calcYearend({ salary: 50_000_000, birth: 'second', paidTax: 0 }).credits.birth, 500_000);
  assert.equal(calcYearend({ salary: 50_000_000, birth: 'third', paidTax: 0 }).credits.birth, 700_000);
  assert.equal(calcYearend({ salary: 50_000_000, birth: 'none', paidTax: 0 }).credits.birth, 0);
});

// ── 보장성보험료 ─────────────────────────────────────────────────────────
test('보장성보험료: 12%, 100만 원 한도', () => {
  const r = calcYearend({ salary: 50_000_000, protectionInsurance: 2_000_000, paidTax: 0 });
  assert.equal(r.credits.protection.base, 1_000_000);
  assert.equal(r.credits.protection.credit, 120_000);
});
