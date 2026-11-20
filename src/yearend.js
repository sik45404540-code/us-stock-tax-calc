/**
 * 연말정산 환급액 시뮬레이터 코어 — 2026년 귀속(2027년 1~2월 정산)
 *
 * 근거
 *  - 소득세법 제47조(근로소득공제), 제50조(기본공제)·제51조(추가공제), 제55조(세율)
 *  - 소득세법 제59조(근로소득세액공제), 제59조의2(자녀세액공제), 제59조의3(연금계좌세액공제)
 *  - 소득세법 제59조의4(특별세액공제: 보장성보험료·의료비·교육비·기부금)
 *  - 조세특례제한법 제126조의2(신용카드 등 사용금액 소득공제), 제95조의2(월세액 세액공제),
 *    제92조(혼인세액공제), 제58조(고향사랑기부금)
 *  - 지방세법 제103조의3(개인지방소득세 = 소득세의 10%)
 *  - 2026년 4대보험: 국민연금 9.5%(근로자 4.75%), 건강보험 7.19%(근로자 3.595%),
 *    장기요양 = 건강보험료의 13.14%, 고용보험 실업급여 1.8%(근로자 0.9%)
 *
 * 계산 순서
 *  1) 총급여 → 근로소득공제(한도 2,000만 원) → 근로소득금액
 *  2) 인적공제·연금보험료·건강보험료 등·신용카드 소득공제 → 과세표준
 *  3) 과세표준 × 기본세율 − 누진공제 = 산출세액
 *  4) 근로소득세액공제·자녀·혼인·출산·연금계좌·월세·보장성보험·의료비·교육비·기부금 세액공제
 *  5) 결정세액 = 산출세액 − 세액공제 (0원 미만 없음)
 *  6) 기납부세액 − 결정세액 = 차감징수세액 (플러스면 환급, 마이너스면 추가 납부)
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

function positive(value) {
  return Math.max(0, toNumber(value));
}

function floorWon(value) {
  return Math.floor(value + EPS);
}

export const TAX_BRACKETS = [
  { upTo: 14_000_000, rate: 0.06, progressive: 0, label: '6%' },
  { upTo: 50_000_000, rate: 0.15, progressive: 1_260_000, label: '15%' },
  { upTo: 88_000_000, rate: 0.24, progressive: 5_760_000, label: '24%' },
  { upTo: 150_000_000, rate: 0.35, progressive: 15_440_000, label: '35%' },
  { upTo: 300_000_000, rate: 0.38, progressive: 19_940_000, label: '38%' },
  { upTo: 500_000_000, rate: 0.40, progressive: 25_940_000, label: '40%' },
  { upTo: 1_000_000_000, rate: 0.42, progressive: 35_940_000, label: '42%' },
  { upTo: Infinity, rate: 0.45, progressive: 65_940_000, label: '45%' },
];

export const YE = {
  /** 근로소득공제 한도 (소득세법 제47조①) */
  earnedDeductionLimit: 20_000_000,
  /** 기본공제 1명당 */
  basicDeduction: 1_500_000,
  /** 70세 이상 1명당 추가공제 */
  elderExtra: 1_000_000,
  /** 장애인 1명당 추가공제 */
  disabledExtra: 2_000_000,
  /** 부녀자 추가공제 */
  femaleExtra: 500_000,
  /** 한부모 추가공제 */
  singleParentExtra: 1_000_000,
  /** 부녀자공제 소득 요건(종합소득금액) */
  femaleIncomeLimit: 30_000_000,
  /** 자녀세액공제 */
  child: { one: 250_000, two: 550_000, base: 550_000, perExtra: 400_000 },
  /** 혼인세액공제(2024~2026년 혼인신고, 생애 1회, 1인당) */
  marriageCredit: 500_000,
  /** 출산·입양 세액공제 */
  birth: { first: 300_000, second: 500_000, third: 700_000 },
  /** 근로소득세액공제 */
  laborCredit: {
    threshold: 1_300_000,
    lowRate: 0.55,
    highRate: 0.30,
    cap1: 740_000,
    cap2: 660_000,
    cap3: 500_000,
    cap4: 200_000,
  },
  /** 지방소득세 = 소득세의 10% */
  localRate: 0.1,
  /** 신용카드 등 소득공제 */
  card: {
    thresholdRate: 0.25,
    creditRate: 0.15,
    debitRate: 0.30,
    marketRate: 0.40,
    transitRate: 0.40,
    cultureRate: 0.30,
    cultureSalaryCap: 70_000_000,
    baseLow: 3_000_000,
    baseHigh: 2_500_000,
    childLow: { 0: 0, 1: 500_000, 2: 1_000_000 },
    childHigh: { 0: 0, 1: 250_000, 2: 500_000 },
    extraLow: 3_000_000,
    extraHigh: 2_000_000,
  },
  /** 월세액 세액공제 */
  rent: {
    salaryCap: 80_000_000,
    lowSalary: 55_000_000,
    lowRate: 0.17,
    highRate: 0.15,
    baseCap: 10_000_000,
  },
  /** 연금계좌 세액공제 */
  pension: {
    pensionCap: 6_000_000,
    combinedCap: 9_000_000,
    lowSalary: 55_000_000,
    lowRate: 0.15,
    highRate: 0.12,
  },
  /** 보장성보험료 세액공제 */
  insuranceCredit: { rate: 0.12, cap: 1_000_000 },
  /** 의료비 세액공제 */
  medical: {
    thresholdRate: 0.03,
    rate: 0.15,
    familyCap: 7_000_000,
  },
  /** 교육비 세액공제 */
  education: {
    rate: 0.15,
    preCap: 3_000_000,
    collegeCap: 9_000_000,
  },
  /** 기부금 세액공제 */
  donation: {
    rateLow: 0.15,
    rateHigh: 0.30,
    split: 10_000_000,
    limitRate: 0.30,
    religionLimitRate: 0.10,
    otherLimitRate: 0.20,
    hometownCap: 20_000_000,
    hometownRate1: 100 / 110,
    hometownCap1: 100_000,
    hometownCap2: 200_000,
    hometownRate2: 0.40,
    hometownRate3: 0.15,
  },
  /** 2026년 4대보험 근로자 부담(추정) */
  insurance: {
    npsRate: 0.0475,
    npsCapFirstHalf: 6_370_000,
    npsCapSecondHalf: 6_590_000,
    npsFloor: 410_000,
    healthRate: 0.03595,
    ltcRate: 0.1314,
    employmentRate: 0.009,
  },
};

/** 근로소득공제 (소득세법 제47조, 한도 2,000만 원) */
export function earnedIncomeDeduction(salaryInput) {
  const salary = positive(salaryInput);
  if (salary <= 0) return 0;
  let deduction;
  if (salary <= 5_000_000) deduction = salary * 0.7;
  else if (salary <= 15_000_000) deduction = 3_500_000 + (salary - 5_000_000) * 0.4;
  else if (salary <= 45_000_000) deduction = 7_500_000 + (salary - 15_000_000) * 0.15;
  else if (salary <= 100_000_000) deduction = 12_000_000 + (salary - 45_000_000) * 0.05;
  else deduction = 14_750_000 + (salary - 100_000_000) * 0.02;
  return Math.min(floorWon(deduction), YE.earnedDeductionLimit, salary);
}

/** 과세표준에 대한 기본세율·누진공제 (소득세법 제55조) */
export function taxBracket(taxableBaseInput) {
  const base = positive(taxableBaseInput);
  const bracket = TAX_BRACKETS.find((b) => base <= b.upTo) || TAX_BRACKETS[TAX_BRACKETS.length - 1];
  return bracket;
}

/** 산출세액 = 과세표준 × 세율 − 누진공제 */
export function computedTax(taxableBaseInput) {
  const base = positive(taxableBaseInput);
  if (base <= 0) return 0;
  const bracket = taxBracket(base);
  return Math.max(0, floorWon(base * bracket.rate - bracket.progressive));
}

/** 근로소득세액공제 한도 (소득세법 제59조②) */
export function laborCreditCap(salaryInput) {
  const salary = positive(salaryInput);
  const c = YE.laborCredit;
  if (salary <= 33_000_000) return c.cap1;
  if (salary <= 70_000_000) return Math.max(c.cap2, c.cap1 - (salary - 33_000_000) * 0.008);
  if (salary <= 120_000_000) return Math.max(c.cap3, c.cap2 - (salary - 70_000_000) * 0.5);
  return Math.max(c.cap4, c.cap3 - (salary - 120_000_000) * 0.5);
}

/** 근로소득세액공제 = min(산출세액 기준 공제액, 총급여 기준 한도) */
export function laborTaxCredit(taxInput, salaryInput) {
  const tax = positive(taxInput);
  if (tax <= 0) return 0;
  const c = YE.laborCredit;
  const raw = tax <= c.threshold
    ? tax * c.lowRate
    : c.threshold * c.lowRate + (tax - c.threshold) * c.highRate;
  return Math.max(0, Math.min(floorWon(raw), floorWon(laborCreditCap(salaryInput))));
}

/** 자녀세액공제 (소득세법 제59조의2①) */
export function childTaxCredit(countInput) {
  const count = Math.max(0, Math.floor(toNumber(countInput)));
  const c = YE.child;
  if (count >= 3) return c.base + (count - 2) * c.perExtra;
  if (count === 2) return c.two;
  if (count === 1) return c.one;
  return 0;
}

/** 4대보험료 근로자 부담 추정 (2026년 요율, 국민연금 상·하한 반영) */
export function estimateInsurance(salaryInput) {
  const salary = positive(salaryInput);
  const r = YE.insurance;
  const monthly = salary / 12;
  if (salary <= 0) {
    return { nps: 0, health: 0, ltc: 0, employment: 0, total: 0, capped: false, floored: false };
  }
  const baseFirst = Math.min(Math.max(monthly, r.npsFloor), r.npsCapFirstHalf);
  const baseSecond = Math.min(Math.max(monthly, r.npsFloor), r.npsCapSecondHalf);
  const nps = floorWon((baseFirst * 6 + baseSecond * 6) * r.npsRate);
  const health = floorWon(salary * r.healthRate);
  const ltc = floorWon(health * r.ltcRate);
  const employment = floorWon(salary * r.employmentRate);
  return {
    nps,
    health,
    ltc,
    employment,
    total: nps + health + ltc + employment,
    capped: monthly > r.npsCapFirstHalf,
    floored: monthly < r.npsFloor,
  };
}

/**
 * 신용카드 등 소득공제 (조세특례제한법 제126조의2)
 * 문턱(총급여 25%)을 낮은 공제율 사용분부터 채우고, 기본한도 + 전통시장·대중교통·문화체육 추가한도.
 */
export function cardDeduction(input, salaryInput, kidsInput) {
  const salary = positive(salaryInput);
  const kids = Math.min(2, Math.max(0, Math.floor(toNumber(kidsInput))));
  const c = YE.card;
  const creditCard = positive(input.creditCard);
  const debit = positive(input.debit);
  const market = positive(input.market);
  const transit = positive(input.transit);
  const cultureInput = positive(input.culture);
  const cultureEligible = salary > 0 && salary <= c.cultureSalaryCap;
  const culture = cultureEligible ? cultureInput : 0;

  const threshold = floorWon(salary * c.thresholdRate);
  const totalSpend = creditCard + debit + market + transit + cultureInput;
  const cashLike = debit + culture;

  const ccAmt = creditCard * c.creditRate;
  const dbAmt = debit * c.debitRate;
  const cultureAmt = culture * c.cultureRate;
  const marketAmt = market * c.marketRate;
  const transitAmt = transit * c.transitRate;

  // 최저사용금액에 해당하는 금액(제외금액)은 낮은 공제율 사용분부터 채운다.
  let excluded;
  if (creditCard >= threshold) {
    excluded = threshold * c.creditRate;
  } else if (creditCard + cashLike >= threshold) {
    excluded = creditCard * c.creditRate + (threshold - creditCard) * c.debitRate;
  } else {
    const rest = Math.max(0, threshold - creditCard - cashLike);
    excluded = creditCard * c.creditRate + cashLike * c.debitRate + Math.min(rest, market + transit) * c.marketRate;
  }
  const creditBase = Math.max(0, floorWon(ccAmt + dbAmt + cultureAmt + marketAmt + transitAmt - excluded));

  const baseLimit = kids === 0
    ? (cultureEligible ? c.baseLow : c.baseHigh)
    : (cultureEligible
      ? (kids === 1 ? c.baseLow + c.childLow[1] : c.baseLow + c.childLow[2])
      : (kids === 1 ? c.baseHigh + c.childHigh[1] : c.baseHigh + c.childHigh[2]));

  const general = Math.min(creditBase, baseLimit);
  const special = floorWon(marketAmt + transitAmt + cultureAmt);
  const extraLimit = cultureEligible ? c.extraLow : c.extraHigh;
  const step2 = Math.min(Math.max(0, creditBase - special), extraLimit);
  const step3 = Math.min(special, step2);
  const extra = Math.min(Math.max(0, creditBase - general), step3);
  const total = general + extra;

  return {
    creditCard, debit, market, transit, culture: cultureInput,
    cultureUsed: culture,
    cultureEligible,
    threshold,
    totalSpend,
    shortfall: Math.max(0, threshold - totalSpend),
    creditBase,
    baseLimit,
    general,
    extra,
    extraLimit,
    total,
    unusedLimit: Math.max(0, baseLimit - general),
    overBaseLimit: Math.max(0, creditBase - baseLimit),
    rates: { creditCard: c.creditRate, debit: c.debitRate, market: c.marketRate, transit: c.transitRate, culture: c.cultureRate },
  };
}

/** 의료비 세액공제 (일반 부양가족 700만 원 한도, 본인·65세 이상·장애인·6세 이하 한도 없음) */
export function medicalCredit(input, salaryInput) {
  const salary = positive(salaryInput);
  const family = positive(input.family);
  const unlimited = positive(input.unlimited);
  const threshold = salary * YE.medical.thresholdRate;
  const familyBase = Math.min(Math.max(0, family - threshold), YE.medical.familyCap);
  const remaining = Math.max(0, threshold - family);
  const unlimitedBase = Math.max(0, unlimited - remaining);
  const base = familyBase + unlimitedBase;
  return {
    threshold,
    family,
    unlimited,
    familyBase,
    unlimitedBase,
    base,
    credit: floorWon(base * YE.medical.rate),
    familyCapped: family - threshold > YE.medical.familyCap,
  };
}

/** 교육비 세액공제 (취학 전·초중고 1명당 300만 원, 대학생 1명당 900만 원, 본인 한도 없음) */
export function educationCredit(input, kidsInput) {
  const kids = Math.max(0, Math.floor(toNumber(kidsInput)));
  const collegeCount = Math.min(Math.max(0, Math.floor(toNumber(input.collegeCount))), kids);
  const preCount = Math.max(0, kids - collegeCount);
  const limit = preCount * YE.education.preCap + collegeCount * YE.education.collegeCap;
  const kidsAmount = positive(input.kids);
  const selfAmount = positive(input.self);
  const kidsBase = Math.min(kidsAmount, limit);
  const base = kidsBase + selfAmount;
  return {
    kids,
    collegeCount,
    preCount,
    limit,
    kidsAmount,
    selfAmount,
    kidsBase,
    base,
    credit: floorWon(base * YE.education.rate),
    overLimit: Math.max(0, kidsAmount - limit),
  };
}

/** 기부금 세액공제 (특례·일반 15%/1,000만 원 초과 30%, 고향사랑기부금 별도 공제율) */
export function donationCredit(input, earnedIncomeInput) {
  const earnedIncome = positive(earnedIncomeInput);
  const general = positive(input.general);
  const religion = positive(input.religion);
  const hometown = Math.min(positive(input.hometown), YE.donation.hometownCap);

  const limit = religion > 0
    ? earnedIncome * YE.donation.religionLimitRate + Math.min(earnedIncome * YE.donation.otherLimitRate, general)
    : earnedIncome * YE.donation.limitRate;
  const totalDonation = general + religion;
  const allowed = Math.min(totalDonation, Math.max(0, limit));
  const generalCredit = allowed <= YE.donation.split
    ? floorWon(allowed * YE.donation.rateLow)
    : floorWon(YE.donation.split * YE.donation.rateLow + (allowed - YE.donation.split) * YE.donation.rateHigh);

  const hometownCredit = floorWon(
    Math.min(hometown, YE.donation.hometownCap1) * YE.donation.hometownRate1
      + Math.max(0, Math.min(hometown, YE.donation.hometownCap2) - YE.donation.hometownCap1) * YE.donation.hometownRate2
      + Math.max(0, hometown - YE.donation.hometownCap2) * YE.donation.hometownRate3,
  );

  return {
    general,
    religion,
    hometown,
    limit,
    allowed,
    disallowed: Math.max(0, totalDonation - allowed),
    generalCredit,
    hometownCredit,
    credit: generalCredit + hometownCredit,
  };
}

/**
 * @param {object} input
 * @param {number} input.salary 총급여(비과세 제외)
 * @param {number} input.dependents 부양가족 수(본인 포함)
 * @param {number} input.elder 70세 이상
 * @param {number} input.disabled 장애인
 * @param {number} input.kids 20세 이하 자녀 수(신용카드 한도·교육비)
 * @param {number} input.kidsCredit 9세 이상 자녀 수(자녀세액공제)
 * @param {boolean} input.singleParent 한부모
 * @param {boolean} input.female 부녀자
 * @param {boolean} input.marriage 2026년 혼인신고
 * @param {'none'|'first'|'second'|'third'} input.birth 출산·입양
 * @param {number} input.insuranceOverride 4대보험료 직접 입력(0이면 추정)
 * @param {number} input.creditCard 신용카드
 * @param {number} input.debit 체크·현금영수증
 * @param {number} input.market 전통시장
 * @param {number} input.transit 대중교통
 * @param {number} input.culture 문화체육
 * @param {number} input.rent 월세액
 * @param {boolean} input.rentEligible 월세 세액공제 요건 충족
 * @param {number} input.pensionSavings 연금저축 납입액
 * @param {number} input.irp IRP·DC형 납입액
 * @param {number} input.protectionInsurance 보장성보험료
 * @param {number} input.medicalSelf 본인·65세 이상·장애인·6세 이하 의료비
 * @param {number} input.medicalFamily 그 외 부양가족 의료비
 * @param {number} input.eduKids 자녀 교육비 합계
 * @param {number} input.eduCollege 대학생 자녀 수
 * @param {number} input.eduSelf 본인 교육비
 * @param {number} input.donationGeneral 종교단체 외 기부금
 * @param {number} input.donationReligion 종교단체 기부금
 * @param {number} input.donationHometown 고향사랑기부금
 * @param {number} input.paidTax 기납부세액(소득세)
 */
export function calcYearend(input = {}) {
  const salary = positive(input.salary);
  const dependents = Math.max(1, Math.floor(toNumber(input.dependents) || 1));
  const elder = Math.max(0, Math.floor(toNumber(input.elder)));
  const disabled = Math.max(0, Math.floor(toNumber(input.disabled)));
  const kids = Math.max(0, Math.floor(toNumber(input.kids)));
  const kidsCredit = Math.min(kids, Math.max(0, Math.floor(toNumber(input.kidsCredit))));
  const singleParent = Boolean(input.singleParent);
  const femaleInput = Boolean(input.female);
  const marriage = Boolean(input.marriage);
  const birthKey = ['first', 'second', 'third'].includes(input.birth) ? input.birth : 'none';

  const earnedDeduction = earnedIncomeDeduction(salary);
  const earnedIncome = Math.max(0, salary - earnedDeduction);

  const insuranceEstimate = estimateInsurance(salary);
  const insuranceOverride = positive(input.insuranceOverride);
  const insuranceTotal = insuranceOverride > 0 ? floorWon(insuranceOverride) : insuranceEstimate.total;

  // 인적공제
  const basic = dependents * YE.basicDeduction;
  const elderExtra = elder * YE.elderExtra;
  const disabledExtra = disabled * YE.disabledExtra;
  const femaleEligible = femaleInput && !singleParent && earnedIncome <= YE.femaleIncomeLimit;
  const female = femaleEligible ? YE.femaleExtra : 0;
  const singleParentAmount = singleParent && kids > 0 ? YE.singleParentExtra : 0;
  const personalTotal = basic + elderExtra + disabledExtra + female + singleParentAmount;

  const card = cardDeduction(input, salary, kids);
  const deductionsTotal = personalTotal + insuranceTotal + card.total;

  const taxableBase = Math.max(0, earnedIncome - deductionsTotal);
  const bracket = taxBracket(taxableBase);
  const tax = computedTax(taxableBase);

  // 세액공제
  const labor = laborTaxCredit(tax, salary);
  const child = childTaxCredit(kidsCredit);
  const marriageCredit = marriage ? YE.marriageCredit : 0;
  const birthCredit = birthKey === 'first' ? YE.birth.first : birthKey === 'second' ? YE.birth.second : birthKey === 'third' ? YE.birth.third : 0;

  const pensionBase = Math.min(positive(input.pensionSavings), YE.pension.pensionCap)
    + Math.min(positive(input.irp), Math.max(0, YE.pension.combinedCap - Math.min(positive(input.pensionSavings), YE.pension.pensionCap)));
  const pensionRate = salary <= YE.pension.lowSalary ? YE.pension.lowRate : YE.pension.highRate;
  const pensionCredit = floorWon(pensionBase * pensionRate);

  const rentAmount = positive(input.rent);
  const rentEligible = Boolean(input.rentEligible);
  const rentRate = salary <= YE.rent.lowSalary ? YE.rent.lowRate : YE.rent.highRate;
  const rentBase = rentEligible && salary > 0 && salary <= YE.rent.salaryCap
    ? Math.min(rentAmount, YE.rent.baseCap)
    : 0;
  const rentCredit = floorWon(rentBase * rentRate);

  const protection = Math.min(positive(input.protectionInsurance), YE.insuranceCredit.cap);
  const protectionCredit = floorWon(protection * YE.insuranceCredit.rate);

  const medical = medicalCredit({ family: input.medicalFamily, unlimited: input.medicalSelf }, salary);
  const education = educationCredit({ kids: input.eduKids, collegeCount: input.eduCollege, self: input.eduSelf }, kids);
  const donation = donationCredit({
    general: input.donationGeneral,
    religion: input.donationReligion,
    hometown: input.donationHometown,
  }, earnedIncome);

  const creditsTotal = labor + child + marriageCredit + birthCredit + pensionCredit + rentCredit
    + protectionCredit + medical.credit + education.credit + donation.credit;

  const creditsOver = Math.max(0, creditsTotal - tax);
  const decidedTax = Math.max(0, tax - creditsTotal);
  const paidTax = positive(input.paidTax);
  const incomeDelta = floorWon(paidTax) - decidedTax;
  const localDelta = floorWon(paidTax * YE.localRate) - floorWon(decidedTax * YE.localRate);
  const totalDelta = incomeDelta + localDelta;

  const notes = [];
  if (!insuranceOverride && insuranceTotal > 0) {
    notes.push({
      level: 'note',
      text: `4대보험료는 2026년 요율로 추정한 값입니다(국민연금 ${insuranceEstimate.nps.toLocaleString('ko-KR')}원·건강보험 ${insuranceEstimate.health.toLocaleString('ko-KR')}원·장기요양 ${insuranceEstimate.ltc.toLocaleString('ko-KR')}원·고용보험 ${insuranceEstimate.employment.toLocaleString('ko-KR')}원). 원천징수영수증의 실제 납부액을 알면 ③ 4대보험료 칸에 직접 입력하세요.`,
    });
  }
  if (insuranceEstimate.capped) {
    notes.push({ level: 'note', text: '국민연금은 기준소득월액 상한(2026년 7월부터 659만 원)에 걸려 보험료가 더 늘지 않습니다.' });
  }
  if (card.shortfall > 0 && salary > 0) {
    notes.push({
      level: 'info',
      text: `신용카드 등 사용액이 총급여의 25%(최저사용금액 ${card.threshold.toLocaleString('ko-KR')}원)에 ${card.shortfall.toLocaleString('ko-KR')}원 모자라 소득공제가 0원입니다. 연말까지 이 금액을 더 쓰면 그 초과분부터 공제됩니다.`,
    });
  } else if (card.overBaseLimit > 0) {
    notes.push({ level: 'ok', text: `신용카드 공제가 기본한도 ${card.baseLimit.toLocaleString('ko-KR')}원을 넘어, 전통시장·대중교통${card.cultureEligible ? '·문화체육' : ''} 추가한도에서 ${card.extra.toLocaleString('ko-KR')}원을 더 받았습니다.` });
  }
  if (rentAmount > 0 && salary > YE.rent.salaryCap) {
    notes.push({ level: 'warn', text: '총급여 8,000만 원을 넘어 월세 세액공제 대상이 아닙니다. 월세액은 계산에서 빠졌습니다.' });
  } else if (rentAmount > 0 && !rentEligible) {
    notes.push({ level: 'warn', text: '월세 세액공제 요건(무주택 세대주 등)을 충족하지 않는 것으로 입력되어 월세액이 빠졌습니다.' });
  } else if (rentAmount > YE.rent.baseCap) {
    notes.push({ level: 'note', text: `월세액은 연 1,000만 원까지만 공제 대상입니다. 초과분 ${(rentAmount - YE.rent.baseCap).toLocaleString('ko-KR')}원은 공제되지 않습니다.` });
  }
  if (positive(input.pensionSavings) + positive(input.irp) > pensionBase) {
    notes.push({ level: 'note', text: `연금계좌 납입액 중 ${(positive(input.pensionSavings) + positive(input.irp) - pensionBase).toLocaleString('ko-KR')}원은 600만·900만 원 한도를 넘어 올해 공제되지 않습니다. ISA 만기 전환 추가 한도는 연금 계산기에서 확인하세요.` });
  }
  if (medical.threshold > 0 && medical.base === 0 && (medical.family > 0 || medical.unlimited > 0)) {
    notes.push({ level: 'info', text: `의료비가 총급여의 3%(${medical.threshold.toLocaleString('ko-KR')}원)를 넘지 않아 의료비 세액공제가 0원입니다.` });
  } else if (medical.familyCapped) {
    notes.push({ level: 'note', text: '본인·65세 이상·장애인·6세 이하가 아닌 부양가족 의료비는 연 700만 원까지만 공제됩니다.' });
  }
  if (education.kids > 0 && education.overLimit > 0) {
    notes.push({ level: 'note', text: `자녀 교육비는 1명당 취학 전·초중고 300만 원, 대학생 900만 원까지입니다. 한도를 넘은 ${education.overLimit.toLocaleString('ko-KR')}원은 공제되지 않습니다.` });
  }
  if (education.kidsAmount > 0 && education.kids === 0) {
    notes.push({ level: 'warn', text: '자녀 수가 0명이라 자녀 교육비 한도가 0원입니다. 인적공제의 20세 이하 자녀 수를 확인하세요.' });
  }
  if (donation.disallowed > 0) {
    notes.push({ level: 'note', text: `기부금 공제한도(소득금액의 ${donation.religion > 0 ? '10%+20%' : '30%'})를 넘은 ${donation.disallowed.toLocaleString('ko-KR')}원은 올해 공제되지 않고 10년간 이월할 수 있습니다.` });
  }
  if (creditsOver > 0) {
    notes.push({ level: 'warn', text: `세액공제 합계가 산출세액보다 ${creditsOver.toLocaleString('ko-KR')}원 많아 결정세액이 0원입니다. 넘는 금액은 사라지며(기부금은 이월 가능), 기납부세액 전액이 환급됩니다.` });
  }
  if (paidTax === 0) {
    notes.push({ level: 'info', text: '기납부세액이 0원이라 결정세액 전액이 추가 납부로 표시됩니다. 원천징수영수증의 기납부세액(소득세)을 넣으면 실제 환급액이 나옵니다.' });
  }
  if (femaleInput && !femaleEligible) {
    notes.push({ level: 'note', text: '부녀자공제는 종합소득금액 3,000만 원 이하이면서 한부모공제를 받지 않을 때만 적용됩니다. 이번 계산에서는 빠졌습니다.' });
  }

  return {
    salary,
    earnedDeduction,
    earnedIncome,
    dependents,
    kids,
    kidsCredit,
    personal: {
      basic,
      elder: elderExtra,
      disabled: disabledExtra,
      female,
      singleParent: singleParentAmount,
      total: personalTotal,
    },
    insurance: {
      ...insuranceEstimate,
      override: insuranceOverride,
      applied: insuranceTotal,
      estimated: insuranceOverride === 0,
    },
    card,
    deductionsTotal,
    taxableBase,
    bracket,
    computedTax: tax,
    credits: {
      labor,
      child,
      marriage: marriageCredit,
      birth: birthCredit,
      pension: { base: pensionBase, rate: pensionRate, credit: pensionCredit },
      rent: { base: rentBase, rate: rentRate, credit: rentCredit, eligible: rentEligible && salary <= YE.rent.salaryCap },
      protection: { base: protection, credit: protectionCredit },
      medical,
      education,
      donation,
      total: creditsTotal,
      over: creditsOver,
    },
    decidedTax,
    paidTax: floorWon(paidTax),
    incomeDelta,
    localDelta,
    totalDelta,
    refund: totalDelta >= 0,
    hasInput: salary > 0,
    notes,
  };
}

export const CONFIG = { YE, TAX_BRACKETS };
