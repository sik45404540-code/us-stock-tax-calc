/**
 * ISA(개인종합자산관리계좌) 절세 계산 코어 — 2026년 기준
 *
 * 근거
 *  - 조세특례제한법 제91조의18(개인종합자산관리계좌에 대한 과세특례)
 *  - 비과세 한도: 일반형 200만 원, 서민·농어민형 400만 원
 *  - 비과세 한도 초과분: 9.9% 분리과세(소득세 9% + 지방소득세 0.9%)
 *  - 납입한도: 연 2,000만 원, 총 1억 원(미납입 한도 이월 가능), 의무가입 3년
 *  - 만기 후 60일 이내 연금계좌 전환: 전환금액의 10%, 최대 300만 원 세액공제
 *  - 일반계좌 과세 대상 수익: 배당소득세 15.4%(소득세 14% + 지방소득세 1.4%)
 *
 * 계산 방식
 *  1) 계좌 안의 이익과 손실을 통산한 순수익을 기준으로 본다(ISA의 핵심 혜택).
 *  2) 일반계좌는 상품별로 과세하므로 손실이 있어도 이익 쪽 세금은 줄지 않는다.
 *  3) 두 경우의 세금 차이를 절세액으로 표시한다.
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

export const ISA_TYPES = {
  general: {
    key: 'general',
    label: '일반형',
    exemption: 2_000_000,
    condition: '만 19세 이상 거주자(소득 요건 없음)',
  },
  lowIncome: {
    key: 'lowIncome',
    label: '서민·농어민형',
    exemption: 4_000_000,
    condition: '직전년도 총급여 5,000만 원 이하 또는 종합소득 3,800만 원 이하',
  },
};

export const ISA = {
  /** 비과세 한도 초과분 분리과세율(지방소득세 포함) */
  separateRate: 0.099,
  /** 일반계좌 배당소득세율(지방소득세 포함) */
  generalRate: 0.154,
  annualLimit: 20_000_000,
  totalLimit: 100_000_000,
  minYears: 3,
  maxYears: 10,
  /** 만기 후 연금계좌 전환 세액공제 */
  pensionRate: 0.1,
  pensionCap: 3_000_000,
};

/**
 * @param {object} input
 * @param {'general'|'lowIncome'} input.type  가입 유형
 * @param {number} input.annualProfit  연간 과세대상 수익(배당·매매차익, 세전)
 * @param {number} input.years         납입(운용) 기간(년)
 * @param {number} input.losses        계좌 안에서 발생한 손실 합계
 * @param {number} input.contribution  총 납입원금(선택)
 */
export function calcIsa(input = {}) {
  const type = ISA_TYPES[input.type] ? input.type : 'general';
  const exemption = ISA_TYPES[type].exemption;

  const annualProfit = Math.max(0, toNumber(input.annualProfit));
  const rawYears = Math.floor(toNumber(input.years));
  const years = Math.min(ISA.maxYears, Math.max(1, rawYears || ISA.minYears));
  const losses = Math.max(0, toNumber(input.losses));
  const contribution = Math.max(0, toNumber(input.contribution));

  const grossProfit = floorWon(annualProfit * years);
  const offsetLoss = Math.min(losses, grossProfit);
  const netProfit = Math.max(0, grossProfit - losses);

  // ISA: 손익통산 → 비과세 한도 → 초과분 9.9%
  const taxableInIsa = Math.max(0, netProfit - exemption);
  const isaTax = floorWon(taxableInIsa * ISA.separateRate);
  const isaReceipt = netProfit - isaTax;

  // 일반계좌: 상품별 과세(손실 통산 없음) → 총수익 15.4%
  const generalTax = floorWon(grossProfit * ISA.generalRate);
  const generalReceipt = Math.max(0, grossProfit - offsetLoss - generalTax);

  const saving = Math.max(0, generalTax - isaTax);
  const savingRate = generalTax > 0 ? saving / generalTax : 0;
  const unusedExemption = Math.max(0, exemption - netProfit);
  const exemptionUsed = Math.min(100, Math.round((Math.min(netProfit, exemption) / exemption) * 100));

  const annualContribution = years > 0 ? Math.round(contribution / years) : contribution;
  const limitWarnings = [];
  if (contribution > ISA.totalLimit) {
    limitWarnings.push({
      level: 'warn',
      text: `총 납입원금 ${Math.round(contribution).toLocaleString('ko-KR')}원은 ISA 총 한도 1억 원을 넘습니다. 초과분은 ISA에 넣을 수 없습니다.`,
    });
  }
  if (annualContribution > ISA.annualLimit) {
    limitWarnings.push({
      level: 'warn',
      text: `연평균 납입액이 ${Math.round(annualContribution).toLocaleString('ko-KR')}원으로 연간 한도 2,000만 원을 넘습니다. 미납입 한도는 다음 해로 이월되지만 총 1억 원까지만 넣을 수 있습니다.`,
    });
  }
  if (years < ISA.minYears) {
    limitWarnings.push({
      level: 'info',
      text: 'ISA 의무가입기간은 3년입니다. 3년을 채우지 않고 해지하면 받은 세제 혜택을 추징당할 수 있습니다.',
    });
  }

  const pensionBase = Math.max(0, contribution + netProfit);
  const pensionCredit = Math.min(floorWon(pensionBase * ISA.pensionRate), ISA.pensionCap);

  return {
    type,
    typeLabel: ISA_TYPES[type].label,
    exemption,
    annualProfit,
    years,
    losses,
    contribution,
    grossProfit,
    offsetLoss,
    netProfit,
    taxableInIsa,
    isaTax,
    isaReceipt,
    generalTax,
    generalReceipt,
    saving,
    savingRate,
    unusedExemption,
    exemptionUsed,
    isaEffectiveRate: netProfit > 0 ? isaTax / netProfit : 0,
    generalEffectiveRate: grossProfit > 0 ? generalTax / grossProfit : 0,
    annualContribution,
    limitWarnings,
    pensionBase,
    pensionCredit,
    hasProfit: grossProfit > 0,
  };
}

export const CONFIG = {
  ISA_TYPES,
  ISA,
};
