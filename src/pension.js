/**
 * 연금저축·IRP(퇴직연금) 세액공제 계산 코어 — 2026년 귀속
 *
 * 근거
 *  - 소득세법 제59조의3(연금계좌세액공제)
 *  - 소득세법 시행령 제40조의2(연금계좌 등), 제118조의2(전환 절차), 제118조의3(한도 초과분 전환 특례)
 *  - 공제율: 종합소득금액 4,500만 원 이하(근로소득만 있는 경우 총급여 5,500만 원 이하) 15%, 초과 12%
 *  - 세액공제 한도: 연금저축계좌 납입액 연 600만 원,
 *    연금저축 600만 원 이내 금액 + 퇴직연금계좌(IRP·DC형) 납입액 합계 연 900만 원
 *  - 납입한도: 연금계좌 합계 연 1,800만 원(ISA 전환금액은 이 한도와 별도)
 *  - ISA 만기 후 60일 이내 연금계좌 전환: 전환금액을 연금계좌 납입액에 포함하고,
 *    공제 한도를 min(전환금액 × 10%, 300만 원)만큼 늘린다 → 공제 대상 최대 1,200만 원
 *  - 지방소득세: 소득세 공제액의 10%(지방세법 제103조의3)
 *
 * 계산 방식
 *  1) 연금저축 납입액은 600만 원에서 먼저 자른다.
 *  2) 자른 연금저축 금액에 IRP 납입액을 더해 다시 900만 원에서 자른다.
 *  3) ISA 전환금액은 900만 원의 남은 자리를 먼저 채우고, 남는 금액은
 *     min(전환금액 × 10%, 300만 원)만큼 늘어난 추가 한도 안에서 인정한다.
 *  4) 인정된 금액 × 공제율(15% 또는 12%) = 소득세 공제액, 그 10%가 지방소득세 공제액.
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

export const INCOME_TYPES = {
  salary: {
    key: 'salary',
    label: '근로소득 총급여',
    threshold: 55_000_000,
    basis: '총급여 5,500만 원',
    placeholder: '5,000만 원',
  },
  total: {
    key: 'total',
    label: '종합소득금액',
    threshold: 45_000_000,
    basis: '종합소득금액 4,500만 원',
    placeholder: '4,000만 원',
  },
};

export const PENSION = {
  /** 연금저축계좌 납입액 공제 한도 */
  pensionCap: 6_000_000,
  /** 연금저축 + 퇴직연금계좌 합산 공제 한도 */
  combinedCap: 9_000_000,
  /** 연금계좌 납입한도(합계, ISA 전환금액 제외) */
  contributionCap: 18_000_000,
  /** ISA 만기 전환 추가 한도 = 전환금액 × 10% */
  isaConversionRate: 0.1,
  /** ISA 만기 전환 추가 한도 상한 */
  isaExtraCap: 3_000_000,
  /** ISA 전환을 포함한 공제 대상 최대 금액 */
  totalCap: 12_000_000,
  /** 공제율(총급여 5,500만 원 이하 / 종합소득금액 4,500만 원 이하) */
  rateLow: 0.15,
  /** 공제율(기준 초과) */
  rateHigh: 0.12,
  /** 지방소득세 = 소득세의 10% */
  localRate: 0.1,
  /** ISA 만기 후 전환 기한(일) */
  isaTransferDays: 60,
};

const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;

/**
 * @param {object} input
 * @param {'salary'|'total'} input.incomeType  소득 구분
 * @param {number} input.income      총급여 또는 종합소득금액
 * @param {number} input.pension     연금저축계좌 연간 납입액
 * @param {number} input.irp         IRP·DC형 퇴직연금 연간 본인 납입액
 * @param {number} input.isaTransfer ISA 만기 후 60일 내 연금계좌 전환 납입액(선택)
 */
export function calcPension(input = {}) {
  const incomeType = INCOME_TYPES[input.incomeType] ? input.incomeType : 'salary';
  const type = INCOME_TYPES[incomeType];

  const income = Math.max(0, toNumber(input.income));
  const pension = Math.max(0, toNumber(input.pension));
  const irp = Math.max(0, toNumber(input.irp));
  const isaTransfer = Math.max(0, toNumber(input.isaTransfer));

  const isLowRate = income <= type.threshold;
  const rate = isLowRate ? PENSION.rateLow : PENSION.rateHigh;

  // ① 연금저축 600만 원 → ② IRP 합산 900만 원
  const pensionApplied = Math.min(pension, PENSION.pensionCap);
  const irpApplied = Math.min(irp, Math.max(0, PENSION.combinedCap - pensionApplied));
  const basicUsed = pensionApplied + irpApplied;
  const basicRoom = Math.max(0, PENSION.combinedCap - basicUsed);

  // ③ ISA 전환금액: 900만 원의 남은 자리를 먼저 채우고, 나머지는 추가 한도에서
  const isaExtraLimit = Math.min(floorWon(isaTransfer * PENSION.isaConversionRate), PENSION.isaExtraCap);
  const isaInBasic = Math.min(isaTransfer, basicRoom);
  const isaInExtra = Math.min(Math.max(0, isaTransfer - isaInBasic), isaExtraLimit);
  const isaApplied = isaInBasic + isaInExtra;

  const creditBase = basicUsed + isaApplied;
  const maxBase = PENSION.combinedCap + isaExtraLimit;

  const incomeTaxCredit = floorWon(creditBase * rate);
  const localTaxCredit = floorWon(incomeTaxCredit * PENSION.localRate);
  const totalCredit = incomeTaxCredit + localTaxCredit;

  // 공제에서 빠진 납입액
  const pensionExcess = pension - pensionApplied;
  const irpExcess = irp - irpApplied;
  const isaExcess = isaTransfer - isaApplied;

  const contributionTotal = pension + irp;
  const contributionOver = Math.max(0, contributionTotal - PENSION.contributionCap);

  const notes = [];
  if (pensionExcess > 0) {
    notes.push({
      level: 'note',
      text: `연금저축 공제 한도(600만 원)를 넘긴 ${won(pensionExcess)}은 올해 세액공제는 안 되지만, 과세이연 혜택은 유지되며 다음 해 이후 전환 신청이 가능합니다.`,
    });
  }
  if (irpExcess > 0) {
    notes.push({
      level: 'note',
      text: `연금저축·IRP 합산 공제 한도(900만 원)를 넘긴 ${won(irpExcess)}은 올해 세액공제는 안 되지만, 과세이연 혜택은 유지되며 다음 해 이후 전환 신청이 가능합니다.`,
    });
  }
  if (isaExcess > 0) {
    notes.push({
      level: 'note',
      text: `ISA 전환금액 중 ${won(isaExcess)}은 추가 한도(전환금액의 10%, 최대 300만 원)를 넘어 올해 공제 대상에서 빠집니다. 이 금액도 연금계좌 안에서 과세이연으로 운용됩니다.`,
    });
  }
  if (contributionOver > 0) {
    notes.push({
      level: 'warn',
      text: `연금저축·IRP 납입액 합계 ${won(contributionTotal)}은 연금계좌 납입한도 1,800만 원을 넘습니다. 초과분은 연금계좌에 넣을 수 없으니 납입 전에 금융사에 확인하세요. (ISA 전환금액은 이 한도와 별도입니다.)`,
    });
  }

  return {
    incomeType,
    incomeTypeLabel: type.label,
    income,
    threshold: type.threshold,
    thresholdBasis: type.basis,
    isLowRate,
    rate,
    effectiveRate: rate * (1 + PENSION.localRate),
    pension,
    irp,
    isaTransfer,
    pensionApplied,
    irpApplied,
    isaInBasic,
    isaInExtra,
    isaApplied,
    isaExtraLimit,
    basicUsed,
    basicRoom,
    creditBase,
    maxBase,
    unusedBase: Math.max(0, maxBase - creditBase),
    baseUsedPct: maxBase > 0 ? Math.min(100, Math.round((creditBase / maxBase) * 100)) : 0,
    incomeTaxCredit,
    localTaxCredit,
    totalCredit,
    pensionExcess,
    irpExcess,
    isaExcess,
    contributionTotal,
    contributionCap: PENSION.contributionCap,
    contributionOver,
    hasInput: pension > 0 || irp > 0 || isaTransfer > 0,
    notes,
  };
}

export const CONFIG = {
  INCOME_TYPES,
  PENSION,
};
