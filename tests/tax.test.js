import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEDUCTION,
  calcTax,
  requiredLossForZero,
  planHarvest,
  harvestPlan,
  ledgerRowPnl,
  calcLedger,
  yearEndDeadline,
  daysBetween,
} from '../src/tax.js';

test('기본공제: 순이익 250만 원 이하는 납부세액 0원', () => {
  const r = calcTax({ profit: 2_400_000 });
  assert.equal(r.netGain, 2_400_000);
  assert.equal(r.taxableBase, 0);
  assert.equal(r.totalTax, 0);
  assert.equal(r.deductionLeft, 100_000);
  assert.equal(r.isZero, true);
});

test('기본공제: 정확히 250만 원도 0원', () => {
  const r = calcTax({ profit: DEDUCTION });
  assert.equal(r.totalTax, 0);
  assert.equal(r.taxableBase, 0);
  assert.equal(r.deductionLeft, 0);
});

test('과세표준 100만 원 → 20% + 지방소득세 10% = 22만 원', () => {
  const r = calcTax({ profit: 3_500_000 });
  assert.equal(r.taxableBase, 1_000_000);
  assert.equal(r.incomeTax, 200_000);
  assert.equal(r.localTax, 20_000);
  assert.equal(r.totalTax, 220_000);
});

test('손익통산: 이익 1,200만 - 손실 300만 → 과세표준 650만, 세액 143만', () => {
  const r = calcTax({ profit: 12_000_000, loss: 3_000_000 });
  assert.equal(r.netGain, 9_000_000);
  assert.equal(r.taxableBase, 6_500_000);
  assert.equal(r.totalTax, 1_430_000);
});

test('필요경비(수수료) 반영: 1,000만 이익 - 20만 수수료 → 160.6만', () => {
  const r = calcTax({ profit: 10_000_000, expenses: 200_000 });
  assert.equal(r.netGain, 9_800_000);
  assert.equal(r.taxableBase, 7_300_000);
  assert.equal(r.incomeTax, 1_460_000);
  assert.equal(r.localTax, 146_000);
  assert.equal(r.totalTax, 1_606_000);
});

test('순손실이면 세액 0원이고 이익으로 상계되지 않는다(음수 과세표준 방지)', () => {
  const r = calcTax({ profit: 1_000_000, loss: 4_000_000 });
  assert.equal(r.netGain, -3_000_000);
  assert.equal(r.taxableBase, 0);
  assert.equal(r.totalTax, 0);
  assert.equal(r.isLoss, true);
  assert.equal(r.deductionLeft, 5_500_000); // 손실 300만 원이 있으면 그만큼 더 이익을 내도 0원
});

test('콤마·문자열 입력도 숫자로 처리', () => {
  const r = calcTax({ profit: '1,200,000', loss: '300,000원', expenses: '' });
  assert.equal(r.netGain, 900_000);
  assert.equal(r.totalTax, 0);
});

test('세금 0원까지 필요한 손실액 계산', () => {
  assert.equal(requiredLossForZero({ profit: 10_000_000 }), 7_500_000);
  assert.equal(requiredLossForZero({ profit: 10_000_000, loss: 2_000_000 }), 5_500_000);
  assert.equal(requiredLossForZero({ profit: 2_000_000 }), 0);
});

test('매도 주수: 필요손실 100만 원, 주당손실 27,000원 → 38주(올림)', () => {
  const plan = planHarvest([{ name: 'RIVN', avg: 100, price: 80, qty: 100, fx: 1350 }], 1_000_000);
  assert.equal(plan.items[0].lossPerShare, 27_000);
  assert.equal(plan.items[0].shares, 38); // 37.037 → 38
  assert.equal(plan.items[0].saleAmount, 38 * 80 * 1350);
  assert.equal(plan.items[0].harvestedLoss, 38 * 27_000);
  assert.equal(plan.shortfall, 0);
  assert.equal(plan.isCovered, true);
});

test('매도 주수는 보유 수량을 넘지 않는다', () => {
  const plan = planHarvest([{ name: 'A', avg: 100, price: 80, qty: 10, fx: 1350 }], 1_000_000);
  assert.equal(plan.items[0].shares, 10);
  assert.equal(plan.items[0].sellsAll, true);
  assert.equal(plan.harvestedLoss, 270_000);
  assert.equal(plan.shortfall, 730_000);
  assert.equal(plan.isCovered, false);
});

test('평가이익 종목(현재가 > 평단가)은 매도 대상이 아니다', () => {
  const plan = planHarvest([{ name: 'WIN', avg: 100, price: 130, qty: 50, fx: 1350 }], 1_000_000);
  assert.equal(plan.items[0].lossPerShare, 0);
  assert.equal(plan.items[0].shares, 0);
  assert.equal(plan.shortfall, 1_000_000);
});

test('여러 종목: 앞 종목부터 채우고, 남으면 다음 종목으로 넘어간다', () => {
  const plan = planHarvest(
    [
      { name: 'A', avg: 50, price: 40, qty: 10, fx: 1300 }, // 주당 13,000 → 최대 130,000
      { name: 'B', avg: 100, price: 90, qty: 100, fx: 1300 }, // 주당 13,000 → 최대 1,300,000
    ],
    500_000,
  );
  assert.equal(plan.items[0].shares, 10);
  assert.equal(plan.items[0].harvestedLoss, 130_000);
  assert.equal(plan.items[1].shares, 29); // 남은 370,000 / 13,000 = 28.46 → 29
  assert.equal(plan.items[1].harvestedLoss, 377_000);
  assert.equal(plan.shortfall, 0);
  assert.equal(plan.saleTotal, 10 * 40 * 1300 + 29 * 90 * 1300);
});

test('역산 플랜: 필요손실만큼 팔면 세액 0원, 절세액 = 기존 세액', () => {
  const res = harvestPlan(
    { profit: 20_000_000, loss: 0, expenses: 0 },
    [{ name: 'TSLA', avg: 300, price: 250, qty: 1000, fx: 1300 }],
  );
  assert.equal(res.before.totalTax, 3_850_000);
  assert.equal(res.need, 17_500_000);
  assert.equal(res.plan.items[0].shares, 270); // 주당 65,000원 × 270주 = 17,550,000원
  assert.equal(res.after.totalTax, 0);
  assert.equal(res.savings, 3_850_000);
});

test('역산 플랜: 이미 0원이면 필요한 손실 0, 매도 주수 0', () => {
  const res = harvestPlan({ profit: 1_000_000 }, [{ name: 'A', avg: 100, price: 50, qty: 10, fx: 1300 }]);
  assert.equal(res.need, 0);
  assert.equal(res.plan.items[0].shares, 0);
  assert.equal(res.savings, 0);
});

test('역산 플랜: 손실이 필요액을 넘으면 0원, 모든 손실 실현 시 세액이 최소', () => {
  const res = harvestPlan(
    { profit: 5_000_000 },
    [{ name: 'A', avg: 100, price: 50, qty: 100, fx: 1300 }],
  );
  assert.equal(res.need, 2_500_000);
  // 주당 65,000 → 39주(2,535,000)로 충분
  assert.equal(res.plan.items[0].shares, 39);
  assert.equal(res.after.totalTax, 0);
  assert.equal(res.taxWithAllLosses, 0);
});

test('장부: 직접 입력 손익과 매수·매도 계산 손익 합산', () => {
  const rows = [
    { name: 'NVDA', mode: 'pnl', pnl: 3_000_000 },
    { name: 'AAPL', mode: 'pnl', pnl: -1_000_000 },
    { name: 'MSFT', mode: 'trade', avg: 300, sell: 350, qty: 10, fx: 1300, fee: 0 },
  ];
  const r = calcLedger(rows);
  assert.equal(r.items[2].pnl, 650_000);
  assert.equal(r.profit, 3_650_000);
  assert.equal(r.loss, 1_000_000);
  assert.equal(r.netGain, 2_650_000);
  assert.equal(r.taxableBase, 150_000);
  assert.equal(r.totalTax, 33_000);
});

test('장부: 왕복 수수료는 원화 손익에서 차감', () => {
  assert.equal(ledgerRowPnl({ mode: 'trade', avg: 100, sell: 120, qty: 10, fx: 1300, fee: 5_000 }), 260_000 - 5_000);
  assert.equal(ledgerRowPnl({ mode: 'pnl', pnl: -123_456 }), -123_456);
});

test('연말 마감: 2026년 안전 매도일은 12월 29일(화)', () => {
  const d = yearEndDeadline(2026);
  assert.equal(d.safeSellDate, '2026-12-29');
  assert.equal(d.lastUsSettleDate, '2026-12-30');
  assert.equal(yearEndDeadline(2031), null);
});

test('D-day 계산은 한국 시간 기준 자정끼리 뺀다', () => {
  assert.equal(daysBetween('2026-11-19', '2026-12-29'), 40);
  assert.equal(daysBetween('2026-11-19', '2026-11-19'), 0);
  assert.equal(daysBetween('bad', '2026-11-19'), null);
});
