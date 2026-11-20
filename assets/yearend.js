import { calcYearend } from '../src/yearend.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('ko-KR');
const won = (n) => `${fmt(n)}원`;
const signedWon = (n) => {
  const value = Math.round(Number(n) || 0);
  if (value === 0) return '0원';
  return `${value > 0 ? '+' : '−'}${fmt(Math.abs(value))}원`;
};
const minusWon = (n) => (Math.round(Number(n) || 0) > 0 ? `−${fmt(n)}원` : '0원');
const signedNum = (n) => {
  const value = Math.round(Number(n) || 0);
  if (value === 0) return '0';
  return `${value > 0 ? '+' : '−'}${fmt(Math.abs(value))}`;
};
const num = (value) => {
  const cleaned = String(value ?? '').replace(/[^0-9.]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const state = {
  salary: 0,
  dependents: 1,
  elder: 0,
  disabled: 0,
  kids: 0,
  kidsCredit: 0,
  singleParent: false,
  female: false,
  marriage: false,
  birth: 'none',
  insuranceOverride: 0,
  creditCard: 0,
  debit: 0,
  market: 0,
  transit: 0,
  culture: 0,
  rent: 0,
  rentEligible: true,
  pensionSavings: 0,
  irp: 0,
  protectionInsurance: 0,
  medicalSelf: 0,
  medicalFamily: 0,
  eduKids: 0,
  eduCollege: 0,
  eduSelf: 0,
  donationGeneral: 0,
  donationReligion: 0,
  donationHometown: 0,
  paidTax: 0,
};

const moneyFields = {
  'in-salary': 'salary',
  'in-insurance': 'insuranceOverride',
  'in-cc': 'creditCard',
  'in-debit': 'debit',
  'in-market': 'market',
  'in-transit': 'transit',
  'in-culture': 'culture',
  'in-rent': 'rent',
  'in-pension': 'pensionSavings',
  'in-irp': 'irp',
  'in-protection': 'protectionInsurance',
  'in-med-self': 'medicalSelf',
  'in-med-family': 'medicalFamily',
  'in-edu-kids': 'eduKids',
  'in-edu-self': 'eduSelf',
  'in-don-general': 'donationGeneral',
  'in-don-religion': 'donationReligion',
  'in-don-hometown': 'donationHometown',
  'in-paid': 'paidTax',
};

const countFields = {
  'in-deps': 'dependents',
  'in-elder': 'elder',
  'in-disabled': 'disabled',
  'in-kids': 'kids',
  'in-kids-credit': 'kidsCredit',
  'in-edu-college': 'eduCollege',
};

const checkFields = {
  'chk-single': 'singleParent',
  'chk-female': 'female',
  'chk-marriage': 'marriage',
  'chk-rent': 'rentEligible',
};

Object.entries(moneyFields).forEach(([id, key]) => {
  const el = $(id);
  if (!el) return;
  state[key] = num(el.value);
  el.addEventListener('input', () => {
    const value = num(el.value);
    el.value = value ? fmt(value) : '';
    state[key] = value;
    render();
  });
  el.addEventListener('blur', () => {
    const value = num(el.value);
    el.value = value ? fmt(value) : '';
    render();
  });
});

Object.entries(countFields).forEach(([id, key]) => {
  const el = $(id);
  if (!el) return;
  state[key] = num(el.value);
  const sync = () => {
    const value = Math.max(0, Math.round(num(el.value)));
    el.value = value ? String(value) : '';
    state[key] = value;
    if (key === 'kids') {
      const creditEl = $('in-kids-credit');
      if (creditEl && num(creditEl.value) > value) {
        creditEl.value = value ? String(value) : '';
        state.kidsCredit = value;
      }
    }
    render();
  };
  el.addEventListener('input', sync);
  el.addEventListener('blur', sync);
});

Object.entries(checkFields).forEach(([id, key]) => {
  const el = $(id);
  if (!el) return;
  state[key] = el.checked;
  el.addEventListener('change', () => {
    state[key] = el.checked;
    render();
  });
});

document.querySelectorAll('.seg button[data-birth]').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.birth = btn.dataset.birth;
    document.querySelectorAll('.seg button[data-birth]').forEach((b) => {
      const on = b === btn;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    render();
  });
});

document.querySelectorAll('.preset[data-salary]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const value = Number(btn.dataset.salary) || 0;
    const el = $('in-salary');
    if (el) el.value = fmt(value);
    state.salary = value;
    render();
  });
});

function flag(level, icon, text) {
  const cls = level === 'warn' || level === 'ok' ? level : 'info';
  return `<div class="flag ${cls}"><span class="flag-ico" aria-hidden="true">${icon}</span><span>${text}</span></div>`;
}

function setCreditRow(rowId, cellId, amount) {
  const row = $(rowId);
  const cell = $(cellId);
  if (!cell) return;
  cell.textContent = amount > 0 ? minusWon(amount) : '0원';
  if (row) row.hidden = amount <= 0;
}

function render() {
  const r = calcYearend(state);

  // 결과 카드
  const isRefund = r.totalDelta >= 0;
  $('out-delta').textContent = signedNum(r.totalDelta);
  $('out-delta').style.color = isRefund ? '#ffffff' : '#ffb4a6';
  $('out-label').textContent = isRefund ? '2027년 2월 연말정산 예상 환급액' : '2027년 2월 연말정산 예상 추가 납부액';
  $('out-salary').textContent = won(r.salary);
  $('out-deductions').textContent = won(r.deductionsTotal);
  $('out-base').textContent = won(r.taxableBase);
  $('out-tax').textContent = won(r.computedTax);
  $('out-bracket-sub').textContent = `${r.bracket.label} 구간 · 누진공제 ${won(r.bracket.progressive)}`;
  $('out-credits').textContent = won(r.credits.total);
  $('out-decided').textContent = won(r.decidedTax);
  $('out-paid').textContent = won(r.paidTax);
  $('out-delta2-label').textContent = r.incomeDelta >= 0 ? '소득세 환급액' : '소득세 추가 납부액';
  $('out-delta2').textContent = signedWon(r.incomeDelta);
  $('out-delta2').className = r.incomeDelta < 0 ? 'neg' : 'good';
  $('out-local').textContent = signedWon(r.localDelta);

  const note = $('out-note');
  if (!r.hasInput) {
    note.innerHTML = '총급여를 입력하면 예상 환급액을 계산합니다. 처음 열면 예시 값이 채워져 있습니다.';
  } else if (r.credits.over > 0) {
    note.innerHTML = `세액공제가 산출세액을 넘어 <b>결정세액이 0원</b>입니다. 기납부한 소득세 <b>${won(r.paidTax)}</b>이 그대로 환급 대상입니다(지방소득세 포함 ${won(Math.abs(r.totalDelta))}).`;
  } else {
    note.innerHTML = `기납부 ${won(r.paidTax)} − 결정세액 ${won(r.decidedTax)} = <b>${won(Math.abs(r.incomeDelta))}</b> ${r.incomeDelta >= 0 ? '환급' : '추가 납부'}. 지방소득세 ${won(Math.abs(r.localDelta))}을 포함하면 <b>${won(Math.abs(r.totalDelta))}</b>입니다.`;
  }

  // 계산서
  $('rc-salary').textContent = won(r.salary);
  $('rc-earned').textContent = minusWon(r.earnedDeduction);
  $('rc-earned-income').textContent = won(r.earnedIncome);
  $('rc-personal').textContent = minusWon(r.personal.total);
  $('rc-insurance').textContent = minusWon(r.insurance.applied);
  $('rc-card').textContent = minusWon(r.card.total);
  $('rc-base').textContent = won(r.taxableBase);
  $('rc-tax').textContent = won(r.computedTax);
  $('rc-bracket').textContent = `${r.bracket.label} 구간`;
  $('rc-labor').textContent = minusWon(r.credits.labor);
  setCreditRow('rc-row-child', 'rc-child', r.credits.child);
  setCreditRow('rc-row-family', 'rc-family', r.credits.marriage + r.credits.birth);
  setCreditRow('rc-row-pension', 'rc-pension', r.credits.pension.credit);
  setCreditRow('rc-row-rent', 'rc-rent', r.credits.rent.credit);
  setCreditRow('rc-row-protection', 'rc-protection', r.credits.protection.credit);
  setCreditRow('rc-row-medical', 'rc-medical', r.credits.medical.credit);
  setCreditRow('rc-row-education', 'rc-education', r.credits.education.credit);
  setCreditRow('rc-row-donation', 'rc-donation', r.credits.donation.credit);
  $('rc-decided').textContent = won(r.decidedTax);
  $('rc-paid').textContent = won(r.paidTax);
  $('rc-delta-label').textContent = r.incomeDelta >= 0 ? '소득세 환급액' : '소득세 추가 납부액';
  $('rc-delta').textContent = signedWon(r.incomeDelta);
  $('rc-delta').className = r.incomeDelta < 0 ? 'neg' : '';
  $('rc-local').textContent = signedWon(r.localDelta);
  $('rc-total').textContent = signedWon(r.totalDelta);
  $('rc-total').className = r.totalDelta < 0 ? 'neg' : '';

  // 입력 카드 안내
  $('income-read').innerHTML = r.salary > 0
    ? `근로소득공제 <b>${won(r.earnedDeduction)}</b> → 근로소득금액 <b>${won(r.earnedIncome)}</b> · ${r.bracket.label} 구간 누진공제 ${won(r.bracket.progressive)}`
    : '근로소득공제와 근로소득금액이 여기에 표시됩니다.';

  const personalParts = [`기본 ${won(r.personal.basic)}`];
  if (r.personal.elder > 0) personalParts.push(`경로 ${won(r.personal.elder)}`);
  if (r.personal.disabled > 0) personalParts.push(`장애인 ${won(r.personal.disabled)}`);
  if (r.personal.female > 0) personalParts.push(`부녀자 ${won(r.personal.female)}`);
  if (r.personal.singleParent > 0) personalParts.push(`한부모 ${won(r.personal.singleParent)}`);
  $('personal-read').innerHTML = `인적공제 합계 <b>${won(r.personal.total)}</b> (${personalParts.join(' + ')})`;

  $('birth-read').innerHTML = r.credits.birth > 0
    ? `출산·입양 세액공제 <b>${won(r.credits.birth)}</b>이 적용됩니다.`
    : '출산·입양 세액공제는 첫째 30만·둘째 50만·셋째 이상 70만 원입니다.';

  $('insurance-read').innerHTML = r.insurance.override > 0
    ? `직접 입력한 4대보험료 <b>${won(r.insurance.applied)}</b>을 소득공제합니다.`
    : `국민연금 ${won(r.insurance.nps)} + 건강보험 ${won(r.insurance.health)} + 장기요양 ${won(r.insurance.ltc)} + 고용보험 ${won(r.insurance.employment)} = <b>${won(r.insurance.applied)}</b> (추정)`;

  $('card-read').innerHTML = `최저사용금액 <b>${won(r.card.threshold)}</b> · 공제 대상 ${won(r.card.creditBase)} · 기본한도 ${won(r.card.baseLimit)}${r.card.extra > 0 ? ` · 추가공제 ${won(r.card.extra)}` : ''} → 신용카드 소득공제 <b>${won(r.card.total)}</b>`;

  $('rent-read').innerHTML = r.credits.rent.base > 0
    ? `공제 대상 월세 ${won(r.credits.rent.base)} × ${(r.credits.rent.rate * 100).toFixed(0)}% = <b>${won(r.credits.rent.credit)}</b>`
    : '월세를 입력하고 요건을 확인하면 공제액이 표시됩니다.';

  $('pension-read').innerHTML = r.credits.pension.base > 0
    ? `공제 대상 ${won(r.credits.pension.base)} × ${(r.credits.pension.rate * 100).toFixed(0)}% = <b>${won(r.credits.pension.credit)}</b> · <a href="pension">ISA 만기 전환·잔여 한도는 연금 계산기 →</a>`
    : `납입액을 입력하면 세액공제액이 표시됩니다. <a href="pension">ISA 만기 전환·잔여 한도는 연금 계산기 →</a>`;

  $('medical-read').innerHTML = `총급여 3% 문턱 <b>${won(r.credits.medical.threshold)}</b> · 공제 대상 ${won(r.credits.medical.base)} → <b>${won(r.credits.medical.credit)}</b>`;

  $('education-read').innerHTML = `자녀 교육비 한도 <b>${won(r.credits.education.limit)}</b> · 공제 대상 ${won(r.credits.education.base)} → <b>${won(r.credits.education.credit)}</b>`;

  $('donation-read').innerHTML = `공제한도 <b>${won(r.credits.donation.limit)}</b> · 공제 대상 ${won(r.credits.donation.allowed)} → <b>${won(r.credits.donation.credit)}</b>`;

  // 안내
  const items = [];
  r.notes.forEach((n) => {
    if (n.level === 'warn') items.push(flag('warn', '!', n.text));
    else if (n.level === 'ok') items.push(flag('ok', '✓', n.text));
    else items.push(flag('info', 'i', n.text));
  });
  items.push(flag('ok', '✓', '2026년 <b>12월 31일(목)</b>까지 받은 급여·쓴 카드·넣은 연금이 2026년 귀속입니다. 2027년 1월 홈택스 간소화 자료에서 빠진 항목이 없는지 확인하세요.'));
  $('flags').innerHTML = items.join('');

  // 하단 고정 요약
  $('stick-label').textContent = isRefund ? '예상 환급액' : '예상 추가 납부액';
  $('stick-value').textContent = signedWon(r.totalDelta);
  $('stick-value').className = isRefund ? 'stick-value' : 'stick-value minus';
}

render();
