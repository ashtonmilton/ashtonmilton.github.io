const spreads = [...document.querySelectorAll('.folio-leaf')];
const controls = document.querySelector('.folio-controls');
const [previous, next] = controls.querySelectorAll('button');
const count = controls.querySelector('span');
const desktop = matchMedia('(min-width: 960px)');
let current = 0;
function render() {
  controls.hidden = !desktop.matches;
  spreads.forEach((spread, index) => { spread.hidden = desktop.matches && index !== current; });
  count.textContent = (current + 1) + ' / ' + spreads.length;
  previous.disabled = current === 0;
  next.disabled = current === spreads.length - 1;
}
function advance(delta) {
  current += delta;
  render();
  if (delta === 1 && next.disabled) previous.focus();
  if (delta === -1 && previous.disabled) next.focus();
}
previous.addEventListener('click', () => advance(-1));
next.addEventListener('click', () => advance(1));
desktop.addEventListener('change', render);
render();
