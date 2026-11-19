import { calcIsa, ISA_TYPES, ISA } from '../src/isa.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('ko-KR');
const won = (n) => `${fmt(n)}원`;
const pct = (n) => `${(Math.round((Number(n) || 0) * 1000) / 10).toFixed(1)}%`;
const num = (value) => {
  const cleaned = String(value ?? '').replace(/[^0-9.]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const state = { type: 'general', annualProfit: 0, years: 3, losses: 0, contribution: 0 };
let touched = false;

// 처음 열면 입력란에 채워 둔 예시 값을 그대로 계산해 비교표를 비워 두지 않는다
const initialProfit = num($('in-profit')?.value);
if (initialProfit > 0) state.annualProfit = initialProfit;

document.querySelectorAll('.seg button[data-type]').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.type = btn.dataset.type;
    document.querySelectorAll('.seg button[data-type]').forEach((b) => {
      const on = b === btn;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    $('type-note').textContent = ISA_TYPES[state.type].condition;
    touched = true;
    render();
  });
});

function bindMoney(id, key) {
  const el = $(id);
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

bindMoney('in-profit', 'annualProfit');
bindMoney('in-losses', 'losses');
bindMoney('in-contribution', 'contribution');

const yearsEl = $('in-years');
yearsEl.addEventListener('input', () => {
  const value = Math.round(num(yearsEl.value));
  state.years = Math.min(ISA.maxYears, Math.max(1, value || ISA.minYears));
  touched = true;
  render();
});
yearsEl.addEventListener('blur', () => {
  yearsEl.value = String(state.years);
});

function flag(level, icon, html) {
  return `<div class="flag ${level}"><span class="flag-ico" aria-hidden="true">${icon}</span><span>${html}</span></div>`;
}

function render() {
  const r = calcIsa(state);
  const hasProfit = r.grossProfit > 0;

  $('out-saving').textContent = fmt(r.saving);
  $('out-isa-tax').textContent = won(r.isaTax);
  $('out-general-tax').textContent = won(r.generalTax);
  $('out-isa-net').textContent = won(r.isaReceipt);
  $('out-general-net').textContent = won(r.generalReceipt);
  $('out-isa-rate').textContent = hasProfit ? pct(r.isaEffectiveRate) : '0%';
  $('out-general-rate').textContent = hasProfit ? pct(r.generalEffectiveRate) : '0%';
  $('out-net-profit').textContent = hasProfit ? won(r.netProfit) : '0원';

  const note = $('out-note');
  if (!hasProfit) {
    note.textContent = '연 수익을 입력하면 ISA와 일반계좌를 비교합니다.';
  } else if (r.saving === 0) {
    note.innerHTML = '비과세 한도 안이라 ISA와 일반계좌 모두 세금이 <b>0원</b>입니다. 손실을 통산할 수익이 없으면 절세 효과도 없습니다.';
  } else {
    note.innerHTML = `${r.years}년 동안 순수익 <b>${won(r.netProfit)}</b>을 <b>${r.typeLabel}</b> 비과세 ${won(r.exemption)} 한도로 계산하면 세금이 ${won(r.isaTax)}입니다. 같은 수익을 일반계좌에서 냈다면 ${won(r.generalTax)}입니다.`;
  }

  // 비과세 한도 게이지
  $('meter-fill').style.width = `${r.exemptionUsed}%`;
  $('meter-fill').classList.toggle('is-over', r.taxableInIsa > 0);
  $('out-used').textContent = `${r.exemptionUsed}%`;
  $('out-exempt').textContent = won(r.unusedExemption);
  $('exempt-help').innerHTML = r.taxableInIsa > 0
    ? `한도를 넘은 ${won(r.taxableInIsa)}에 9.9%가 붙습니다.`
    : `한도까지 ${won(r.unusedExemption)}이 남아 있습니다.`;

  // 비교 표
  $('cmp-net').textContent = won(r.netProfit);
  $('cmp-net-general-base').textContent = won(r.grossProfit);
  $('cmp-tax-isa').textContent = won(r.isaTax);
  $('cmp-tax-general').textContent = won(r.generalTax);
  $('cmp-net-isa').textContent = won(r.isaReceipt);
  $('cmp-net-general').textContent = won(r.generalReceipt);
  $('cmp-tax-general').className = r.generalTax > r.isaTax ? '' : 'win';
  $('cmp-tax-isa').className = r.isaTax < r.generalTax ? 'win' : '';
  $('cmp-net-isa').className = r.isaReceipt > r.generalReceipt ? 'win' : '';
  $('cmp-net-general').className = '';
  $('cmp-note').textContent = `총 수익 ${won(r.grossProfit)}${r.offsetLoss > 0 ? ` − 손실 ${won(r.offsetLoss)}` : ''} = 순수익 ${won(r.netProfit)}. 일반계좌는 손실을 통산하지 못해 수익 ${won(r.grossProfit)} 전액에 15.4%가 붙습니다.`;

  // 안내
  const items = [];
  if (!touched) {
    items.push(flag('info', 'i', 'ISA는 계좌 안의 이익과 손실을 먼저 통산한 뒤 비과세 한도를 적용합니다. 일반계좌와 가장 크게 갈리는 지점입니다.'));
  }
  r.limitWarnings.forEach((w) => items.push(flag(w.level === 'warn' ? 'warn' : 'info', '!', w.text)));
  if (hasProfit) {
    items.push(flag('ok', '✓', `만기 후 60일 안에 연금계좌로 옮기면 전환금액의 10%, 최대 300만 원을 세액공제받습니다. 이번 예시에서는 <b>${won(r.pensionCredit)}</b>입니다.`));
  }
  $('flags').innerHTML = items.join('');

  $('summary-years').textContent = `${r.years}년`;
  $('summary-type').textContent = r.typeLabel;
  $('summary-exempt').textContent = won(r.exemption);
}

render();
