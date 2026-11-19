import { calcPension, INCOME_TYPES, PENSION } from '../src/pension.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('ko-KR');
const won = (n) => `${fmt(n)}원`;
const pct = (n) => `${(Math.round((Number(n) || 0) * 1000) / 10).toFixed(1)}%`;
const num = (value) => {
  const cleaned = String(value ?? '').replace(/[^0-9.]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const state = { incomeType: 'salary', income: 0, pension: 0, irp: 0, isaTransfer: 0 };

// 처음 열면 입력란에 채워 둔 예시 값을 그대로 계산해 결과 카드를 비워 두지 않는다
const initial = { income: 'in-income', pension: 'in-pension', irp: 'in-irp', isaTransfer: 'in-isa' };
Object.entries(initial).forEach(([key, id]) => {
  state[key] = num($(id)?.value);
});

document.querySelectorAll('.seg button[data-income]').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.incomeType = btn.dataset.income;
    document.querySelectorAll('.seg button[data-income]').forEach((b) => {
      const on = b === btn;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    const type = INCOME_TYPES[state.incomeType];
    $('income-label').innerHTML = `${state.incomeType === 'salary' ? '연간 총급여' : '연간 종합소득금액'}<em>공제율 판단 기준 · 예시 ${type.placeholder}</em>`;
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
    render();
  });
  el.addEventListener('blur', () => {
    const value = num(el.value);
    el.value = value ? fmt(value) : '';
    render();
  });
}

bindMoney('in-income', 'income');
bindMoney('in-pension', 'pension');
bindMoney('in-irp', 'irp');
bindMoney('in-isa', 'isaTransfer');

function flag(level, icon, html) {
  const cls = level === 'note' ? 'info' : level;
  return `<div class="flag ${cls}"><span class="flag-ico" aria-hidden="true">${icon}</span><span>${html}</span></div>`;
}

function render() {
  const r = calcPension(state);

  // 결과 카드
  $('out-credit').textContent = fmt(r.totalCredit);
  $('out-base').textContent = won(r.creditBase);
  $('out-rate').textContent = r.isLowRate ? '15%' : '12%';
  $('out-rate-sub').textContent = r.isLowRate ? '지방소득세 포함 16.5%' : '지방소득세 포함 13.2%';
  $('out-income-tax').textContent = won(r.incomeTaxCredit);
  $('out-local-tax').textContent = won(r.localTaxCredit);
  $('out-total').textContent = won(r.totalCredit);

  const note = $('out-note');
  if (!r.hasInput) {
    note.innerHTML = '연금저축·IRP 납입액을 입력하면 예상 세액공제액을 계산합니다.';
  } else if (r.creditBase === 0) {
    note.innerHTML = '공제 대상 납입액이 없습니다. 연금저축은 600만 원, IRP를 합치면 900만 원까지 공제 대상입니다.';
  } else {
    const parts = [];
    if (r.pensionApplied > 0) parts.push(`연금저축 ${won(r.pensionApplied)}`);
    if (r.irpApplied > 0) parts.push(`IRP ${won(r.irpApplied)}`);
    if (r.isaApplied > 0) parts.push(`ISA 전환 ${won(r.isaApplied)}`);
    note.innerHTML = `${parts.join(' + ')} = <b>${won(r.creditBase)}</b>에 ${r.isLowRate ? '15%' : '12%'}를 적용했습니다. 소득세 ${won(r.incomeTaxCredit)} + 지방소득세 ${won(r.localTaxCredit)}입니다.`;
  }

  // 소득 기준선 안내
  const type = INCOME_TYPES[r.incomeType];
  const gap = r.income - r.threshold;
  const incomeNote = $('income-note');
  if (r.income === 0) {
    incomeNote.innerHTML = `${type.label}을 입력하면 공제율이 정해집니다. 기준은 <b>${type.basis}</b>입니다.`;
  } else if (r.isLowRate) {
    incomeNote.innerHTML = `${type.label} ${won(r.income)}은 기준선 <b>${type.basis}</b> 이하라서 공제율 <b>15%</b>(지방소득세 포함 16.5%)가 적용됩니다. ${gap >= 0 ? `기준선까지 <b>${won(gap)}</b> 남았습니다.` : ''}`;
  } else {
    incomeNote.innerHTML = `${type.label} ${won(r.income)}은 기준선 <b>${type.basis}</b>을 <b>${won(gap)}</b> 넘어 공제율 <b>12%</b>(지방소득세 포함 13.2%)가 적용됩니다.`;
  }

  // 한도 게이지
  $('meter-fill').style.width = `${r.baseUsedPct}%`;
  $('out-used').textContent = `${r.baseUsedPct}%`;
  $('out-unused').textContent = won(r.unusedBase);
  $('summary-max').textContent = `최대 ${won(r.maxBase)}`;
  $('base-help').innerHTML = r.unusedBase > 0
    ? `한도까지 ${won(r.unusedBase)} 남았습니다.`
    : `공제 대상 한도를 모두 채웠습니다.`;

  // 계좌별 표
  $('bd-pension-in').textContent = won(r.pension);
  $('bd-pension-ok').textContent = won(r.pensionApplied);
  $('bd-pension-no').textContent = won(r.pensionExcess);
  $('bd-irp-in').textContent = won(r.irp);
  $('bd-irp-ok').textContent = won(r.irpApplied);
  $('bd-irp-no').textContent = won(r.irpExcess);
  $('bd-isa-in').textContent = won(r.isaTransfer);
  $('bd-isa-ok').textContent = won(r.isaApplied);
  $('bd-isa-no').textContent = won(r.isaExcess);
  $('bd-sum-in').textContent = won(r.pension + r.irp + r.isaTransfer);
  $('bd-sum-ok').textContent = won(r.creditBase);
  $('bd-sum-no').textContent = won(r.pensionExcess + r.irpExcess + r.isaExcess);
  $('bd-pension-no').className = r.pensionExcess > 0 ? '' : '';
  $('bd-pension-ok').className = r.pensionApplied > 0 ? 'win' : '';
  $('bd-irp-ok').className = r.irpApplied > 0 ? 'win' : '';
  $('bd-isa-ok').className = r.isaApplied > 0 ? 'win' : '';
  $('summary-income').textContent = r.incomeTypeLabel;
  $('summary-rate').textContent = r.isLowRate ? '15%' : '12%';

  const bdNote = [];
  if (r.isaExtraLimit > 0) {
    bdNote.push(`ISA 전환 추가 한도는 min(전환금액 × 10%, 300만 원) = ${won(r.isaExtraLimit)}입니다.`);
  }
  if (r.basicRoom > 0 && r.isaTransfer > 0) {
    bdNote.push(`900만 원 한도의 빈자리 ${won(r.basicRoom)}을 ISA 전환금액이 먼저 채웠습니다.`);
  }
  bdNote.push(`납입한도(연 1,800만 원) 점검 대상은 연금저축 + IRP 합계 ${won(r.contributionTotal)}입니다. ISA 전환금액은 이 한도와 별도입니다.`);
  $('breakdown-note').textContent = bdNote.join(' ');

  // 안내
  const items = [];
  r.notes.forEach((n) => items.push(flag(n.level, n.level === 'warn' ? '!' : 'i', n.text)));
  if (r.isaTransfer > 0 && r.isaInExtra > 0) {
    items.push(flag('ok', '✓', `ISA 만기 전환으로 공제 대상이 <b>${won(r.isaInExtra)}</b> 늘어 세액공제가 <b>${won(Math.floor((r.isaInExtra * r.rate) + Math.floor(r.isaInExtra * r.rate) * PENSION.localRate))}</b> 더 늘어납니다(지방소득세 포함).`));
  }
  if (r.unusedBase > 0 && r.hasInput) {
    const add = Math.floor(r.unusedBase * r.rate);
    const addTotal = add + Math.floor(add * PENSION.localRate);
    items.push(flag('info', '+', `한도를 모두 채우려면 <b>${won(r.unusedBase)}</b>을 더 넣어야 하고, 그만큼 세금이 <b>${won(addTotal)}</b> 더 줄어듭니다.`));
  }
  if (r.contributionOver === 0 && r.pensionExcess > 0) {
    items.push(flag('info', 'i', '연금저축 600만 원을 넘긴 금액은 공제되지 않습니다. IRP에 추가로 넣으면 900만 원 한도 안에서 공제 대상이 됩니다.'));
  }
  items.push(flag('ok', '✓', '2026년 <b>12월 31일(목)</b>까지 입금한 금액이 2026년 귀속입니다. 금융사 마감 시각이 달라 연말에는 <b>12월 26일</b> 전에 넣어 두는 편이 안전합니다.'));
  $('flags').innerHTML = items.join('');
}

render();
