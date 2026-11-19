/**
 * 'CSV 불러오기' 탭의 「증권사별 CSV 받는 법」 가이드.
 *
 * 바깥 토글은 <details>/<summary>라서 자바스크립트가 없어도 열고 닫힌다.
 * 여기서는 안쪽 증권사 탭(키움·신한·삼성·NH·토스·미래에셋)의 전환만 맡는다.
 */

export function mountCsvGuide() {
  const root = document.getElementById('csv-help');
  if (!root) return;

  const tabs = Array.from(root.querySelectorAll('.broker-tab'));
  const panels = Array.from(root.querySelectorAll('.broker-panel'));
  if (!tabs.length || tabs.length !== panels.length) return;

  const select = (index) => {
    tabs.forEach((tab, i) => {
      const on = i === index;
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
      panels[i].hidden = !on;
    });
  };

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(i));
    tab.addEventListener('keydown', (event) => {
      const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      let next = i;
      if (event.key === 'ArrowRight') next = (i + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else next = tabs.length - 1;
      select(next);
      tabs[next].focus();
    });
  });

  const opened = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
  select(opened >= 0 ? opened : 0);
}
