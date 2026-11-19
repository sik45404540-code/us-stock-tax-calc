/**
 * 미국주식 양도소득세 계산 코어 (2026년 귀속 기준)
 *
 * 근거
 *  - 소득세법 제94조·제98조·제102조·제103조, 지방세법 제103조의3
 *  - 국세청 「2026년 신고안내 – 해외주식과 세금(개인투자자용)」
 *  - 기본공제: 국내·해외주식 합산 연 250만 원
 *  - 세율: 양도소득세 20% + 지방소득세(산출세액의 10%) = 실효 22%
 *  - 양도 시기: 대금을 청산한 날(결제일). 미국 주식은 2024-05-28부터 T+1.
 *  - RIA(국내시장복귀계좌) 과세특례: 조세특례제한법 제91조의26
 *    (2026.3.31. 국회 본회의 통과 '환율안정 3법', 2026.4.21. 신설)
 *
 * 이 모듈은 화면(app.js)과 단위 테스트(tests/tax.test.js)가 함께 쓴다.
 */

export const DEDUCTION = 2_500_000;
export const INCOME_TAX_RATE = 0.2;
export const LOCAL_TAX_RATE = 0.1;

/**
 * RIA(국내시장복귀계좌) 과세특례 — 조세특례제한법 제91조의26
 *  - 대상: 2025.12.23. 이전에 보유하던 국외상장주식을 RIA 계좌를 통해 2026.12.31.까지 양도
 *  - 공제액 = 양도소득금액 × 매도 시점별 공제율(2026.1.1.~5.31. 100% · 6.1.~7.31. 80% · 8.1.~12.31. 50%)
 *  - 납입한도 5,000만 원(모든 금융회사 합계), 납입일부터 1년 내 인출 시 추징 + 이자상당가산액
 *  - 환헤지 파생상품은 별도 특례(매입액의 5%, 최대 500만 원)로 이 계산에는 넣지 않고 안내만 한다
 */
export const RIA = {
  limit: 50_000_000,
  hedgeRate: 0.05,
  hedgeCap: 5_000_000,
  periods: {
    none: { label: '해당 없음', rate: 0 },
    may: { label: '2026.1.1.~5.31. 매도', rate: 1 },
    jul: { label: '2026.6.1.~7.31. 매도', rate: 0.8 },
    dec: { label: '2026.8.1.~12.31. 매도', rate: 0.5 },
  },
};

/** RIA 공제율(매도 시점) */
export function riaRate(period) {
  const found = RIA.periods[period];
  return found ? found.rate : 0;
}

const EPS = 1e-7;

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined) return 0;
  const cleaned = String(value).replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function floorWon(value) {
  return Math.floor(value + EPS);
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

/** 실현손익 3개 값 → 세액 계산 (RIA 공제 선택 반영) */
export function calcTax(input = {}) {
  const profit = Math.max(0, toNumber(input.profit));
  const loss = Math.max(0, toNumber(input.loss));
  const expenses = Math.max(0, toNumber(input.expenses));

  const netGain = profit - loss - expenses; // 양도소득금액

  // RIA 공제: 그해 양도소득금액을 넘지 않는 범위에서만 뺀다(기본값 0원 → 기존 결과 그대로)
  const riaInput = Math.max(0, toNumber(input.riaGain));
  const period = RIA.periods[input.riaPeriod] ? input.riaPeriod : 'none';
  const rate = RIA.periods[period].rate;
  const riaBase = Math.min(riaInput, Math.max(0, netGain));
  const riaDeduction = Math.min(floorWon(riaBase * rate), Math.max(0, netGain));
  const gainAfterRia = netGain - riaDeduction;

  const baseRaw = gainAfterRia - DEDUCTION;
  const taxableBase = baseRaw > 0 ? floorWon(baseRaw) : 0;

  const incomeTax = floorWon(taxableBase * INCOME_TAX_RATE);
  const localTax = floorWon(incomeTax * LOCAL_TAX_RATE);
  const totalTax = incomeTax + localTax;

  return {
    profit,
    loss,
    expenses,
    netGain,
    riaGain: riaInput,
    riaPeriod: period,
    riaRate: rate,
    riaDeduction,
    riaApplied: riaDeduction > 0,
    gainAfterRia,
    deduction: Math.min(DEDUCTION, Math.max(0, gainAfterRia)),
    deductionLeft: Math.max(0, DEDUCTION - gainAfterRia),
    taxableBase,
    incomeTax,
    localTax,
    totalTax,
    effectiveRate: netGain > 0 ? totalTax / netGain : 0,
    isZero: totalTax === 0,
    isLoss: netGain < 0,
  };
}

/** 세금을 0원으로 만들기 위해 추가로 실현해야 하는 손실액(원) */
export function requiredLossForZero(input = {}) {
  const profit = Math.max(0, toNumber(input.profit));
  const loss = Math.max(0, toNumber(input.loss));
  const expenses = Math.max(0, toNumber(input.expenses));
  const netGain = profit - loss - expenses;
  const period = RIA.periods[input.riaPeriod] ? input.riaPeriod : 'none';
  const riaBase = Math.min(Math.max(0, toNumber(input.riaGain)), Math.max(0, netGain));
  const riaDeduction = Math.min(floorWon(riaBase * RIA.periods[period].rate), Math.max(0, netGain));
  const excess = netGain - riaDeduction - DEDUCTION;
  return excess > 0 ? floorWon(excess) : 0;
}

/**
 * 보유 종목별 매도 주수 계산
 * positions: [{ name, avg, price, qty, fx }]  (avg·price는 $, fx는 원/$)
 * input 순서대로 채운다(사용자가 파는 순서를 정한다).
 */
export function planHarvest(positions = [], requiredLoss = 0) {
  const need = Math.max(0, toNumber(requiredLoss));
  let remaining = need;

  const items = (Array.isArray(positions) ? positions : []).map((p, index) => {
    const avg = Math.max(0, toNumber(p.avg));
    const price = Math.max(0, toNumber(p.price));
    const qty = Math.max(0, Math.floor(toNumber(p.qty) + EPS));
    const fx = Math.max(0, toNumber(p.fx));

    const lossPerShare = Math.max(0, (avg - price) * fx);
    const maxLoss = lossPerShare * qty;

    let shares = 0;
    if (remaining > 0 && lossPerShare > 0 && qty > 0) {
      shares = Math.min(qty, Math.max(1, Math.ceil((remaining - EPS) / lossPerShare)));
      remaining = Math.max(0, remaining - shares * lossPerShare);
    }

    return {
      index,
      name: String(p.name || `종목 ${index + 1}`),
      avg,
      price,
      qty,
      fx,
      lossPerShare: round2(lossPerShare),
      maxLoss: floorWon(maxLoss),
      shares,
      saleAmount: floorWon(shares * price * fx),
      harvestedLoss: floorWon(shares * lossPerShare),
      isLoss: lossPerShare > 0,
      sellsAll: shares > 0 && shares === qty,
    };
  });

  const harvestedLoss = items.reduce((sum, it) => sum + it.harvestedLoss, 0);
  const saleTotal = items.reduce((sum, it) => sum + it.saleAmount, 0);
  const availableLoss = items.reduce((sum, it) => sum + it.maxLoss, 0);

  return {
    need,
    items,
    harvestedLoss,
    saleTotal,
    availableLoss,
    shortfall: Math.max(0, need - harvestedLoss),
    isCovered: need > 0 && harvestedLoss >= need - EPS,
  };
}

/** 실현손익 + 손실 종목 → 매도 플랜과 절세액 */
export function harvestPlan(input = {}, positions = []) {
  const before = calcTax(input);
  const need = requiredLossForZero(input);
  const plan = planHarvest(positions, need);

  const after = calcTax({
    profit: input.profit,
    loss: Math.max(0, toNumber(input.loss)) + plan.harvestedLoss,
    expenses: input.expenses,
  });

  const allLosses = calcTax({
    profit: input.profit,
    loss: Math.max(0, toNumber(input.loss)) + plan.availableLoss,
    expenses: input.expenses,
  });

  return {
    before,
    need,
    plan,
    after,
    savings: before.totalTax - after.totalTax,
    taxWithAllLosses: allLosses.totalTax,
    maxSaving: before.totalTax - allLosses.totalTax,
  };
}

/** 장부 한 줄의 원화 손익 */
export function ledgerRowPnl(row = {}) {
  const mode = row.mode === 'pnl' ? 'pnl' : 'trade';
  if (mode === 'pnl') return Math.round(toNumber(row.pnl));

  const avg = Math.max(0, toNumber(row.avg));
  const sell = Math.max(0, toNumber(row.sell));
  const qty = Math.max(0, toNumber(row.qty));
  const fx = Math.max(0, toNumber(row.fx));
  const fee = Math.max(0, toNumber(row.fee)); // 왕복 수수료(원)
  return Math.round((sell - avg) * qty * fx - fee);
}

/** 장부 여러 줄 → 합계·세액 */
export function calcLedger(rows = []) {
  const items = (Array.isArray(rows) ? rows : []).map((row, index) => ({
    index,
    name: String(row.name || `종목 ${index + 1}`),
    mode: row.mode === 'pnl' ? 'pnl' : 'trade',
    pnl: ledgerRowPnl(row),
  }));

  const profit = items.filter((it) => it.pnl > 0).reduce((sum, it) => sum + it.pnl, 0);
  const loss = items.filter((it) => it.pnl < 0).reduce((sum, it) => sum - it.pnl, 0);

  return {
    items,
    profit,
    loss,
    ...calcTax({ profit, loss, expenses: 0 }),
  };
}

/**
 * 연말 결제 마감 안내.
 * 미국 주식은 T+1 결제이고, 국내 증권사는 통상 그 다음 국내 영업일에 결제 처리한다.
 * 2026년: 12/30(수) 미국 체결분 → 12/31(목) 미국 결제이지만,
 *         12/31(목)은 한국거래소 연말 휴장일이라 국내 결제가 2027년 1월로 넘어갈 위험이 크다.
 *         그래서 12/29(화)가 안전선이고 12/30 체결분은 비권장.
 */
export const YEAR_END = {
  2025: { safe: '2025-12-29', lastUsSettle: '2025-12-30' },
  2026: { safe: '2026-12-29', lastUsSettle: '2026-12-30' },
};

export function yearEndDeadline(year) {
  const key = Number(year);
  const found = YEAR_END[key];
  if (!found) return null;
  return {
    year: key,
    safeSellDate: found.safe,
    lastUsSettleDate: found.lastUsSettle,
  };
}

/** 두 날짜(YYYY-MM-DD) 사이 남은 일수 */
export function daysBetween(fromDate, toDate) {
  const a = new Date(`${fromDate}T00:00:00+09:00`);
  const b = new Date(`${toDate}T00:00:00+09:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b - a) / 86400000);
}

export const CONFIG = {
  DEDUCTION,
  INCOME_TAX_RATE,
  LOCAL_TAX_RATE,
  RIA,
  EFFECTIVE_RATE: INCOME_TAX_RATE * (1 + LOCAL_TAX_RATE),
  YEAR: 2026,
};
