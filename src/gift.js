/**
 * 증여세 · 배우자 증여 절세 코어 — 2026년 귀속, 한국 거주자 기준
 *
 * 근거 법령
 *  - 상속세 및 증여세법 제53조 (증여재산공제: 배우자 6억, 직계존속 5천만/미성년 2천만,
 *    직계비속 5천만, 기타친족 1천만, 그 밖의 자 0원 — 10년 누계)
 *  - 같은 법 제53조의2 (혼인·출산 증여재산공제 1억, 기본공제와 별개, 혼인+출산 통합 1억)
 *  - 같은 법 제55조 (과세표준, 과세표준 50만원 미만이면 부과하지 않음)
 *  - 같은 법 제56조·제26조 (세율 10·20·30·40·50% + 누진공제)
 *  - 같은 법 제57조 (증여자의 자녀가 아닌 직계비속에게 증여 시 산출세액의 30% 가산,
 *    미성년자이고 이번 증여재산가액이 20억원 초과 시 40%)
 *  - 같은 법 제58조 (기납부세액 공제), 제69조 (신고세액공제 3%)
 *  - 소득세법 제97조의2 (2025.1.1. 이후 증여분 주식은 증여일부터 1년 내 양도 시 이월과세)
 */

const EPS = 1e-7;

/** 증여자·수증자 관계별 10년 누계 공제 한도 */
export const RELATIONS = {
  spouse: { label: '배우자', limit: 600_000_000, short: '6억' },
  parentAdult: { label: '직계존속 → 성인 자녀', limit: 50_000_000, short: '5천만' },
  parentMinor: { label: '직계존속 → 미성년 자녀', limit: 20_000_000, short: '2천만' },
  childToParent: { label: '직계비속 → 부모', limit: 50_000_000, short: '5천만' },
  relative: { label: '기타친족', limit: 10_000_000, short: '1천만' },
  stranger: { label: '타인', limit: 0, short: '0원' },
};

/** 증여세 세율 구간 (상증세법 제56조 → 제26조) */
export const BRACKETS = [
  { upTo: 100_000_000, rate: 0.1, progressive: 0, label: '1억 원 이하' },
  { upTo: 500_000_000, rate: 0.2, progressive: 10_000_000, label: '5억 원 이하' },
  { upTo: 1_000_000_000, rate: 0.3, progressive: 60_000_000, label: '10억 원 이하' },
  { upTo: 3_000_000_000, rate: 0.4, progressive: 160_000_000, label: '30억 원 이하' },
  { upTo: Infinity, rate: 0.5, progressive: 460_000_000, label: '30억 원 초과' },
];

export const GIFT = {
  marriageBirthDeduction: 100_000_000,
  generationSkipRate: 0.3,
  generationSkipMinorRate: 0.4,
  generationSkipMinorThreshold: 2_000_000_000,
  minTaxableBase: 500_000,
  reportDiscountRate: 0.03,
  priorAggregateMin: 10_000_000,
  spouseLimit: 600_000_000,
  capitalGainDeduction: 2_500_000,
  capitalGainRate: 0.22,
};

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined) return 0;
  const cleaned = String(value).replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function roundWon(value) {
  return Math.round(value + EPS);
}

function isLinealElder(relation) {
  return relation === 'parentAdult' || relation === 'parentMinor';
}

/** 과세표준이 속한 세율 구간 */
export function bracketFor(base) {
  const b = Math.max(0, toNumber(base));
  return BRACKETS.find((br) => b <= br.upTo) || BRACKETS[BRACKETS.length - 1];
}

/**
 * 증여세 계산
 * @param {object} input
 * @param {number} input.amount        이번 증여재산가액(원)
 * @param {string} input.relation      RELATIONS 키
 * @param {number} [input.priorGift]   같은 증여자에게서 10년 내 받은 증여재산가액 합계
 * @param {number} [input.priorTax]    10년 내 기납부 증여세액
 * @param {boolean} [input.marriageBirth] 혼인·출산 공제(직계존속만)
 * @param {boolean} [input.generationSkip] 세대생략 증여
 * @param {boolean} [input.minor]      수증자가 미성년자
 * @param {boolean} [input.reportDiscount] 기한 내 신고세액공제(기본 ON)
 */
export function giftTax(input = {}) {
  const relation = RELATIONS[input.relation] ? input.relation : 'parentAdult';
  const rel = RELATIONS[relation];
  const amount = Math.max(0, toNumber(input.amount));
  const priorGift = Math.max(0, toNumber(input.priorGift));
  const priorTaxInput = Math.max(0, toNumber(input.priorTax));
  const marriageBirth = Boolean(input.marriageBirth) && isLinealElder(relation);
  const generationSkip = Boolean(input.generationSkip);
  const minor = Boolean(input.minor) || relation === 'parentMinor';
  const reportDiscount = input.reportDiscount !== false;

  // 제47조 제2항: 같은 증여자에게서 10년 내 받은 재산의 과세가액 합계가 1천만 원 이상이면 가산
  const priorAggregated = priorGift >= GIFT.priorAggregateMin ? priorGift : 0;
  const taxableValue = amount + priorAggregated; // 증여세 과세가액

  // 10년 누계 공제: 이미 쓴 만큼 한도가 줄어든다
  const usedLimit = Math.min(priorGift, rel.limit);
  const deductionBase = Math.max(0, rel.limit - usedLimit);
  const deductionExtra = marriageBirth ? GIFT.marriageBirthDeduction : 0;
  // 혼인·출산 공제가 먼저 빠지고, 남은 과세가액에 관계별 한도를 적용한다
  const appliedBase = Math.min(deductionBase, Math.max(0, taxableValue - deductionExtra));
  const deduction = Math.min(deductionBase + deductionExtra, taxableValue);

  const taxBase = Math.max(0, taxableValue - deduction);
  const belowMinimum = taxBase > 0 && taxBase < GIFT.minTaxableBase; // 과세최저한 50만 원

  const bracket = bracketFor(taxBase);
  const computedRaw = belowMinimum || taxBase === 0
    ? 0
    : taxBase * bracket.rate - bracket.progressive;
  const computedTax = roundWon(Math.max(0, computedRaw));

  // 제57조: 미성년자이면서 '증여재산가액'이 20억 원을 초과할 때만 40%
  const skipRate = generationSkip
    ? (minor && amount > GIFT.generationSkipMinorThreshold
      ? GIFT.generationSkipMinorRate
      : GIFT.generationSkipRate)
    : 0;
  const surcharge = roundWon(computedTax * skipRate);

  const beforeCredit = computedTax + surcharge;
  const priorTax = Math.min(priorTaxInput, beforeCredit);
  const afterPrior = Math.max(0, beforeCredit - priorTax);
  const reportCredit = reportDiscount ? roundWon(afterPrior * GIFT.reportDiscountRate) : 0;
  const total = Math.max(0, afterPrior - reportCredit);

  return {
    relation,
    relationLabel: rel.label,
    amount,
    priorGift,
    priorAggregated,
    aggregateSkipped: priorGift > 0 && priorAggregated === 0,
    taxableValue,
    deductionBase,
    appliedBase,
    deductionExtra,
    deduction,
    marriageBirth,
    taxBase,
    bracket: { ...bracket, percent: Math.round(bracket.rate * 100) },
    computedTax,
    generationSkip,
    minor,
    skipRate,
    surcharge,
    beforeCredit,
    priorTax,
    reportDiscount,
    reportCredit,
    total,
    belowMinimum,
    belowDeduction: taxBase === 0 && taxableValue > 0,
    limit: rel.limit,
    remainingLimit: Math.max(0, rel.limit - usedLimit - appliedBase),
    effectiveRate: amount > 0 ? total / amount : 0,
  };
}

/**
 * 미국주식 배우자 증여 절세 비교
 *
 * A. 증여 없이 바로 매도: (평가액 − 원취득가 − 필요경비 − 250만) × 22%
 * B. 배우자에게 증여 → 1년 넘게 보유 → 매도가가 증여평가액과 같다면 양도차익 0원.
 *    이때 드는 돈은 증여세뿐(배우자 공제 6억 잔여분 이내면 0원).
 *    단, 2025.1.1. 이후 증여분을 1년 안에 팔면 이월과세로 취득가액이 원래대로 돌아간다.
 */
export function compareSpouseGift(input = {}) {
  const value = Math.max(0, toNumber(input.value));
  const costBasis = Math.max(0, toNumber(input.costBasis));
  const expenses = Math.max(0, toNumber(input.expenses));
  const priorGift = Math.max(0, toNumber(input.priorGift));

  // A안: 증여 없이 바로 매도
  const gainA = Math.max(0, value - costBasis - expenses);
  const baseA = Math.max(0, gainA - GIFT.capitalGainDeduction);
  const taxA = roundWon(baseA * GIFT.capitalGainRate);

  // B안: 증여 후 1년 초과 보유 → 매도가 = 증여평가액
  const gift = giftTax({
    amount: value,
    relation: 'spouse',
    priorGift,
    reportDiscount: true,
  });
  const gainB = Math.max(0, value - value - expenses);
  const taxB = roundWon(gainB * GIFT.capitalGainRate);
  const totalB = gift.total + taxB;

  // 1년 안에 매도(이월과세): 취득가액은 증여자의 원래 취득가, 낸 증여세는 필요경비
  const gainEarly = Math.max(0, value - costBasis - expenses - gift.total);
  const baseEarly = Math.max(0, gainEarly - GIFT.capitalGainDeduction);
  const taxEarly = roundWon(baseEarly * GIFT.capitalGainRate);
  const totalEarly = gift.total + taxEarly;

  return {
    value,
    costBasis,
    expenses,
    priorGift,
    gainA,
    baseA,
    taxA,
    gift,
    taxB,
    totalB,
    saving: taxA - totalB,
    gainEarly,
    baseEarly,
    taxEarly,
    totalEarly,
    spouseRoom: Math.max(0, GIFT.spouseLimit - Math.min(priorGift, GIFT.spouseLimit)),
    hasValue: value > 0,
  };
}
