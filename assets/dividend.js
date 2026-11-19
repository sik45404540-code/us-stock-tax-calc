import { calcDividend, FINANCIAL_THRESHOLD } from '../src/dividend.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('ko-KR');
const won = (n) => `${fmt(n)}원`;
const pct = (n) => `${(Math.round((Number(n) || 0) * 1000) / 10).toFixed(1)}%`;
const num = (value) => {
  const cleaned = String(value ?? '').replace(/[^0-9.]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const inputs = {
  domestic: $('in-domestic'),
  us: $('in-us'),
  interest: $('in-interest'),
  otherIncome: $('in-other'),
  deductions: $('in-deductions'),
};

const state = { domestic: 0, us: 0, interest: 0, otherIncome: 0, deductions: 0 };
let touched = false;

function bindMoney(el, key) {
  if (!el) return;
  el.addEventListener('input', () => {
    const value = num(el.value);
    el.value = value ? fmt(value) : '';
    state[key] = value;
    touched = true;
    render();
  });
  el.addEventListener('blur', () => {
    const value = num(el.value);
    el.value = value ? fmt(value) : '';
  });
}

Object.entries(inputs).forEach(([key, el]) => bindMoney(el, key));

function flag(level, icon, html) {
  return `<div class="flag ${level}"><span class="flag-ico" aria-hidden="true">${icon}</span><span>${html}</span></div>`;
}

function renderFlags(r) {
  const box = $('flags');
  if (!box) return;
  const items = [];
  if (!touched) {
    items.push(flag('info', 'i', '금액을 넣으면 2,000만 원 종합과세 기준과 건강보험 피부양자 위험을 함께 알려 드립니다.'));
  } else {
    if (r.exceeded) {
      items.push(flag('warn', '!', `금융소득이 2,000만 원 기준을 <b>${won(r.excess)}</b> 넘었습니다. 다음 해 5월에 종합소득세를 신고해야 하고, 신고하지 않으면 무신고 가산세가 붙습니다.`));
    } else if (r.financial > 0) {
      items.push(flag('ok', '✓', `금융소득 ${won(r.financial)}은 2,000만 원 이하입니다. 국내 배당·이자는 15.4% 원천징수로 납세 의무가 끝납니다.`));
    }
    if (r.dependent.risk) {
      items.push(flag('warn', '!', `건강보험 <b>피부양자 탈락 위험</b>: 금융소득과 다른 소득을 합한 ${won(r.dependent.incomeTotal)}이 연 2,000만 원을 넘습니다. 재산 기준(재산세 과세표준 5.4억·9억 원)까지 함께 봐야 합니다.`));
    } else if (r.dependent.financialCounted) {
      items.push(flag('info', 'i', '금융소득이 1,000만 원을 넘으면 피부양자 판정에서 <b>전액</b>이 소득으로 잡힙니다. 다른 소득까지 합쳐 2,000만 원을 넘지 않는지 확인하세요.'));
    }
    if (r.us > 0) {
      items.push(flag('info', 'i', '미국 배당은 현지에서 15%가 먼저 빠집니다. 국내 세율(14%)보다 높아 국내에서 더 떼지 않으며, 넘게 낸 1%p는 환급되지 않습니다.'));
    }
  }
  box.innerHTML = items.join('');
}

function render() {
  const r = calcDividend(state);
  const hasAny = state.domestic + state.us + state.interest + state.otherIncome > 0;

  $('out-total').textContent = fmt(r.totalTax);
  $('out-fin').textContent = won(r.financial);
  $('out-dom-tax').textContent = won(r.domesticTax);
  $('out-us-tax').textContent = won(r.usTax);
  $('out-net').textContent = won(r.netReceipt);
  $('out-rate').textContent = hasAny ? pct(r.effectiveRate) : '0%';

  const extra = $('out-extra');
  if (!hasAny) {
    extra.textContent = '0원';
    extra.className = '';
  } else if (r.mode === 'combined') {
    if (r.refund > 0) {
      extra.textContent = `환급 ${won(r.refund)}`;
      extra.className = 'neg';
    } else {
      extra.textContent = won(r.additional);
      extra.className = '';
    }
  } else {
    extra.textContent = won(r.usTopUp);
    extra.className = '';
  }

  const note = $('out-note');
  if (!hasAny) {
    note.textContent = '금액을 입력하면 바로 계산됩니다.';
  } else if (r.mode === 'combined') {
    note.innerHTML = `금융소득이 2,000만 원을 넘어 <b>종합과세</b>로 계산했습니다. 국내에서 낼 세금은 ${won(r.koreanTax)}(국세 ${won(r.nationalTax - r.foreignCredit)} + 지방세 ${won(r.localTax)})이고, 원천징수된 ${won(r.prepaid)}을 빼면 <b>${r.refund > 0 ? '환급' : '추가 납부'} ${won(r.refund || r.additional)}</b>입니다.`;
  } else {
    note.innerHTML = `2,000만 원 이하라 <b>원천징수로 종결</b>됩니다. 국내 배당·이자에 15.4%, 미국 배당에 현지 15%가 전부입니다.`;
  }

  $('out-sub').textContent = r.mode === 'combined' && r.us > 0
    ? `외국납부세액공제 ${won(r.foreignCredit)} 적용(한도 ${won(r.foreignCreditLimit)}) · 지방소득세는 공제 후 국세의 10%`
    : '지방소득세는 소득세액의 10%입니다.';

  // 2,000만 원 게이지
  const used = Math.min(100, Math.round((r.financial / FINANCIAL_THRESHOLD) * 100));
  const fill = $('meter-fill');
  fill.style.width = `${used}%`;
  fill.classList.toggle('is-over', r.exceeded);
  $('out-pct').textContent = `${used}%`;
  $('out-room').textContent = r.exceeded ? `초과 ${won(r.excess)}` : won(r.thresholdLeft);
  $('room-help').innerHTML = r.exceeded
    ? '2,000만 원을 넘어 초과분이 다른 소득과 합산됩니다.'
    : '이 금액만큼 더 받아도 종합과세로 넘어가지 않습니다.';

  // 비교과세 표
  const card = $('cmp-card');
  card.hidden = r.mode !== 'combined';
  if (r.mode === 'combined') {
    $('cmp-a').textContent = won(r.methodA);
    $('cmp-b').textContent = won(r.methodB);
    $('cmp-local').textContent = won(r.localTax);
    $('cmp-credit').textContent = r.us > 0 ? `-${won(r.foreignCredit)}` : '0원';
    $('cmp-national').textContent = won(r.koreanTax);
    $('cmp-pick').textContent = r.methodApplied === 'combined' ? '① 합산과세 적용' : '② 비교과세 적용';
    $('cmp-a').className = r.methodApplied === 'combined' ? 'win' : '';
    $('cmp-b').className = r.methodApplied === 'flat' ? 'win' : '';
    $('cmp-note').innerHTML = `①은 2,000만 원×14% + (초과분 ${won(r.excess)} + 다른 소득 ${won(r.otherIncome)} − 공제 ${won(r.deductions)}) × 기본세율, ②는 금융소득 ${won(r.financial)}×14% + (다른 소득 − 공제) × 기본세율입니다. 이번에는 <b>${r.bracket.label}</b> 구간이 적용됐습니다.`;
  }

  renderFlags(r);
}

render();
