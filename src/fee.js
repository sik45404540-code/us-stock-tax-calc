/**
 * 해외주식 수수료 · 환전우대 실수령 비교 코어
 *
 * 왕복 한 번(매수 → 매도)에 드는 비용을 원화로 계산한다.
 *
 * 비용 구조
 *  1) 매수 환전: 투자금 × 기준 스프레드 × (1 − 환전우대율)
 *     예) 스프레드 1%, 우대 90% → 실제 부담 0.1% / 우대 100% → 0%
 *  2) 매수 수수료: (투자금 − 매수 환전비용) × 수수료율
 *  3) 매도 수수료: 매도 평가액 × 수수료율
 *  4) 매도 환전: (매도 평가액 − 매도 수수료) × 스프레드 × (1 − 우대율)
 *
 * 실제 증권사 고지 기준(수수료율·스프레드·우대율)은 계좌마다 다르므로 입력값으로 받는다.
 */

const EPS = 1e-7;

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined) return 0;
  const cleaned = String(value).replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundWon(value) {
  return Math.round(value + EPS);
}

/**
 * 한 증권사(계좌)의 왕복 비용·실수령
 * @param {object} input
 * @param {number} input.amount    투자금(원)
 * @param {number} input.feeRate   매매 수수료율(0.0007 = 0.07%)
 * @param {number} input.fxDiscount 환전우대율(0.9 = 90%)
 * @param {number} input.spread    기준 환전 스프레드(0.01 = 1%)
 * @param {number} input.returnRate 매도 시 수익률(0.1 = +10%)
 */
export function brokerRoundTrip(input = {}) {
  const amount = Math.max(0, toNumber(input.amount));
  const feeRate = clamp(toNumber(input.feeRate), 0, 0.1);
  const fxDiscount = clamp(toNumber(input.fxDiscount), 0, 1);
  const spread = clamp(toNumber(input.spread), 0, 0.1);
  const returnRate = clamp(toNumber(input.returnRate), -1, 10);

  const effectiveSpread = spread * (1 - fxDiscount);

  const buyFx = amount * effectiveSpread; // 매수 환전 비용
  const invest = amount - buyFx; // 달러로 바꾼 투자 원금(원화 환산)
  const buyFee = invest * feeRate;
  const netInvest = invest - buyFee; // 실제로 주식을 사는 데 들어간 금액

  const saleValue = netInvest * (1 + returnRate); // 매도 평가액
  const sellFee = saleValue * feeRate;
  const sellFx = Math.max(0, saleValue - sellFee) * effectiveSpread; // 매도 환전 비용
  const receipt = Math.max(0, saleValue - sellFee - sellFx);

  const totalCost = buyFx + buyFee + sellFee + sellFx;
  const costRate = amount > 0 ? totalCost / amount : 0;
  const profit = receipt - amount;
  const profitRate = amount > 0 ? profit / amount : 0;

  // 손익분기 수익률: 실수령이 투자금과 같아지는 매도 수익률
  const breakEvenRate = amount > 0 && netInvest > 0
    ? amount / (netInvest * (1 - feeRate) * (1 - effectiveSpread)) - 1
    : 0;

  return {
    amount,
    feeRate,
    fxDiscount,
    spread,
    effectiveSpread,
    returnRate,
    buyFx: roundWon(buyFx),
    invest: roundWon(invest),
    buyFee: roundWon(buyFee),
    netInvest: roundWon(netInvest),
    saleValue: roundWon(saleValue),
    sellFee: roundWon(sellFee),
    sellFx: roundWon(sellFx),
    receipt: roundWon(receipt),
    totalCost: roundWon(totalCost),
    costRate,
    profit: roundWon(profit),
    profitRate,
    breakEvenRate,
  };
}

/**
 * 두 계좌 비교
 * @param {object} input { amount, spread, returnRate, a:{label,feeRate,fxDiscount}, b:{...} }
 */
export function compareBrokers(input = {}) {
  const amount = Math.max(0, toNumber(input.amount));
  const spread = clamp(toNumber(input.spread), 0, 0.1);
  const returnRate = clamp(toNumber(input.returnRate), -1, 10);
  const a = brokerRoundTrip({
    amount,
    spread,
    returnRate,
    feeRate: input.a?.feeRate,
    fxDiscount: input.a?.fxDiscount,
  });
  const b = brokerRoundTrip({
    amount,
    spread,
    returnRate,
    feeRate: input.b?.feeRate,
    fxDiscount: input.b?.fxDiscount,
  });

  const diff = b.receipt - a.receipt; // B가 더 받는 금액
  const cheaper = Math.abs(diff) < 1 ? 'same' : diff > 0 ? 'b' : 'a';
  const diffCost = Math.abs(a.totalCost - b.totalCost);

  return {
    amount,
    spread,
    returnRate,
    a: { ...a, label: String(input.a?.label || 'A') },
    b: { ...b, label: String(input.b?.label || 'B') },
    diff,
    diffCost,
    cheaper,
    hasAmount: amount > 0,
  };
}

export const CONFIG = {
  DEFAULT_SPREAD: 0.01,
};
