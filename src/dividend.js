/**
 * 배당소득세 · 금융소득 종합과세 계산 코어 (2026년 귀속 기준)
 *
 * 근거
 *  - 소득세법 제14조③6호(종합과세기준금액 2,000만 원), 제17조(배당소득), 제55조(기본세율),
 *    제57조(외국납부세액공제), 제62조(금융소득 산출세액 계산), 제127조·제129조(원천징수)
 *  - 지방세법 제103조의3(개인지방소득세 10%)·제103조의13(원천징수)
 *  - 한미 조세조약 제12조(배당 제한세율 15%), 국세청 「금융소득 종합과세 해설」
 *
 * 계산 방식
 *  1) 금융소득 = 국내 배당 + 미국 배당 + 국내 이자
 *  2) 2,000만 원 이하: 원천징수로 종결(분리과세와 같은 결과)
 *     · 국내 배당·이자 15.4%(소득세 14% + 지방소득세 1.4%)
 *     · 미국 배당은 현지 15% 원천징수. 국내 세율(14%)보다 높아 국내 추가 징수 없음
 *  3) 2,000만 원 초과: 국세청 비교과세 방식으로 산출세액을 정한다.
 *     ① 2,000만×14% + (2,000만 초과 금융소득 + 다른 종합소득금액 − 소득공제) × 기본세율
 *     ② 금융소득×14% + (다른 종합소득금액 − 소득공제) × 기본세율
 *     → 산출세액 = max(①, ②), 여기에 지방소득세 10%, 외국납부세액공제, 기납부세액 반영
 *
 * 단순화한 부분(화면에서도 안내한다)
 *  - 국내 배당의 배당가산(gross-up)과 배당세액공제는 반영하지 않는다(국내 배당이 많을 때 실제보다 조금 높게 나온다).
 *  - 이자·배당 외 금융소득(비영업대금 이익 25% 등)과 분리과세·비과세 상품은 다루지 않는다.
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

function floorWon(value) {
  return Math.floor(value + EPS);
}

/** 금융소득 종합과세 기준금액 (소득세법 제14조③6호) */
export const FINANCIAL_THRESHOLD = 20_000_000;
/** 국내 배당·이자 원천징수 실효세율: 소득세 14% + 지방소득세 1.4% */
export const WITHHOLD_RATE = 0.154;
/** 배당·이자 소득세율 */
export const INCOME_TAX_RATE = 0.14;
/** 개인지방소득세율(소득세액의 10%) */
export const LOCAL_TAX_RATE = 0.1;
/** 한미 조세조약상 미국 배당 제한세율 */
export const US_WITHHOLD_RATE = 0.15;
/** 건강보험 피부양자 소득요건(연 합산소득 2,000만 원) */
export const DEPENDENT_LIMIT = 20_000_000;
/** 피부양자 판정에서 금융소득을 0원으로 보는 기준(1,000만 원). 넘으면 전액 합산 */
export const DEPENDENT_FINANCIAL_FLOOR = 10_000_000;

/** 2026년 귀속 종합소득세 기본세율(소득세법 제55조) */
export const INCOME_BRACKETS = [
  { upTo: 14_000_000, rate: 0.06, deduct: 0, label: '6%' },
  { upTo: 50_000_000, rate: 0.15, deduct: 1_260_000, label: '15%' },
  { upTo: 88_000_000, rate: 0.24, deduct: 5_760_000, label: '24%' },
  { upTo: 150_000_000, rate: 0.35, deduct: 15_440_000, label: '35%' },
  { upTo: 300_000_000, rate: 0.38, deduct: 19_940_000, label: '38%' },
  { upTo: 500_000_000, rate: 0.4, deduct: 25_940_000, label: '40%' },
  { upTo: 1_000_000_000, rate: 0.42, deduct: 35_940_000, label: '42%' },
  { upTo: Infinity, rate: 0.45, deduct: 65_940_000, label: '45%' },
];

/** 과세표준이 속하는 구간의 세율·누진공제 */
export function bracketFor(base) {
  const b = Math.max(0, toNumber(base));
  for (const row of INCOME_BRACKETS) {
    if (b <= row.upTo) return row;
  }
  return INCOME_BRACKETS[INCOME_BRACKETS.length - 1];
}

/** 과세표준 → 종합소득 산출세액 (기본세율, 누진공제 반영) */
export function basicIncomeTax(base) {
  const b = Math.max(0, floorWon(toNumber(base)));
  if (!b) return 0;
  const { rate, deduct } = bracketFor(b);
  return Math.max(0, floorWon(b * rate - deduct));
}

/**
 * 배당·이자 소득 입력값 → 세금 계산
 * @param {object} input
 * @param {number} input.domestic     국내 배당(세전)
 * @param {number} input.us           미국 배당(세전, 원화 환산)
 * @param {number} input.interest     국내 이자(예금·채권, 세전)
 * @param {number} input.otherIncome  다른 종합소득금액(근로소득금액·사업소득금액 등)
 * @param {number} input.deductions   종합소득공제 합계(모르면 0)
 */
export function calcDividend(input = {}) {
  const domestic = Math.max(0, toNumber(input.domestic));
  const us = Math.max(0, toNumber(input.us));
  const interest = Math.max(0, toNumber(input.interest));
  const otherIncome = Math.max(0, toNumber(input.otherIncome));
  const deductions = Math.max(0, toNumber(input.deductions));

  const financial = domestic + us + interest;
  const exceeded = financial > FINANCIAL_THRESHOLD + EPS;
  const excess = exceeded ? floorWon(financial - FINANCIAL_THRESHOLD) : 0;
  const thresholdLeft = Math.max(0, FINANCIAL_THRESHOLD - financial);

  const domesticBase = domestic + interest;
  const domesticTax = floorWon(domesticBase * WITHHOLD_RATE); // 원천징수로 종결되는 부분
  const usTax = floorWon(us * US_WITHHOLD_RATE); // 미국 현지 원천징수

  // 2,000만 원 이하: 미국 배당에 대한 국내 추가 징수(현지 세율이 14%보다 낮을 때만 발생)
  let usTopUp = 0;
  if (!exceeded && us > 0) {
    const koreaOnUs = floorWon(us * INCOME_TAX_RATE);
    const credited = Math.min(koreaOnUs, usTax);
    usTopUp = floorWon(Math.max(0, koreaOnUs - credited) * (1 + LOCAL_TAX_RATE));
  }

  const dependentFinancial = financial > DEPENDENT_FINANCIAL_FLOOR + EPS ? financial : 0;
  const dependentIncome = dependentFinancial + otherIncome;

  const base = {
    domestic,
    us,
    interest,
    otherIncome,
    deductions,
    financial,
    domesticBase,
    exceeded,
    excess,
    thresholdLeft,
    domesticTax,
    usTax,
    usTopUp,
    dependent: {
      countedFinancial: dependentFinancial,
      incomeTotal: dependentIncome,
      risk: dependentIncome > DEPENDENT_LIMIT + EPS,
      financialCounted: dependentFinancial > 0,
    },
  };

  // ── 2,000만 원 이하: 원천징수로 종결 ──────────────────────────────
  if (!exceeded) {
    const koreanTax = domesticTax + usTopUp;
    const totalTax = koreanTax + usTax;
    return {
      ...base,
      mode: 'separate',
      methodA: 0,
      methodB: 0,
      methodApplied: 'separate',
      nationalTax: 0,
      foreignCredit: 0,
      foreignCreditLimit: 0,
      localTax: 0,
      koreanTax,
      prepaid: domesticTax,
      additional: usTopUp,
      refund: 0,
      bracket: bracketFor(0),
      combinedBase: 0,
      otherBase: Math.max(0, otherIncome - deductions),
      totalTax,
      netReceipt: Math.max(0, financial - totalTax),
      effectiveRate: financial > 0 ? totalTax / financial : 0,
      holdingRate: financial > 0 ? (1 - totalTax / financial) : 1,
    };
  }

  // ── 2,000만 원 초과: 비교과세 ─────────────────────────────────────
  const combinedBase = Math.max(0, excess + otherIncome - deductions);
  const otherBase = Math.max(0, otherIncome - deductions);

  const methodA = floorWon(FINANCIAL_THRESHOLD * INCOME_TAX_RATE) + basicIncomeTax(combinedBase);
  const methodB = floorWon(financial * INCOME_TAX_RATE) + basicIncomeTax(otherBase);
  const methodApplied = methodA >= methodB ? 'combined' : 'flat';
  const nationalTax = Math.max(methodA, methodB);

  const totalIncome = financial + otherIncome;
  const foreignCreditLimit = totalIncome > 0 ? floorWon(nationalTax * (us / totalIncome)) : 0;
  const foreignCredit = Math.min(usTax, foreignCreditLimit);
  const nationalLeft = Math.max(0, nationalTax - foreignCredit);
  const localTax = floorWon(nationalLeft * LOCAL_TAX_RATE);
  const koreanTax = nationalLeft + localTax;
  const prepaid = domesticTax;
  const additional = Math.max(0, koreanTax - prepaid);
  const refund = Math.max(0, prepaid - koreanTax);
  const totalTax = koreanTax + usTax;

  return {
    ...base,
    mode: 'combined',
    methodA,
    methodB,
    methodApplied,
    nationalTax,
    foreignCredit,
    foreignCreditLimit,
    localTax,
    koreanTax,
    prepaid,
    additional,
    refund,
    bracket: bracketFor(combinedBase),
    combinedBase,
    otherBase,
    totalTax,
    netReceipt: Math.max(0, financial - totalTax),
    effectiveRate: financial > 0 ? totalTax / financial : 0,
    holdingRate: financial > 0 ? (1 - totalTax / financial) : 1,
  };
}

export const CONFIG = {
  FINANCIAL_THRESHOLD,
  WITHHOLD_RATE,
  INCOME_TAX_RATE,
  LOCAL_TAX_RATE,
  US_WITHHOLD_RATE,
  DEPENDENT_LIMIT,
  DEPENDENT_FINANCIAL_FLOOR,
  YEAR: 2026,
};
