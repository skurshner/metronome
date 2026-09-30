/** Minimal bottom sheet. `build` is re-run by the caller via the returned `refresh`. */
export function openSheet(title: string, build: (body: HTMLElement) => void) {
  const back = document.createElement('div');
  back.className = 'sheet-back';
  back.innerHTML = `<div class="sheet" role="dialog" aria-label="${title}"><div class="grab"></div><h2>${title}</h2><div class="sheet-body"></div></div>`;
  const sheet = back.firstElementChild as HTMLElement;
  const body = back.querySelector<HTMLElement>('.sheet-body')!;
  const refresh = () => { body.replaceChildren(); build(body); };
  const close = () => {
    sheet.classList.remove('open');
    back.classList.remove('open');
    setTimeout(() => back.remove(), 250);
  };
  back.addEventListener('pointerdown', (e) => { if (e.target === back) close(); });
  document.body.appendChild(back);
  refresh();
  requestAnimationFrame(() => { back.classList.add('open'); sheet.classList.add('open'); });
  return { close, refresh };
}

export function chips<T extends string | number>(opts: { value: T; label: string }[], selected: T, pick: (v: T) => void, cls = '') {
  const wrap = document.createElement('div');
  wrap.className = `chips ${cls}`;
  for (const o of opts) {
    const b = document.createElement('button');
    b.className = `chip${o.value === selected ? ' on' : ''}`;
    b.textContent = o.label;
    b.onclick = () => pick(o.value);
    wrap.appendChild(b);
  }
  return wrap;
}

export function section(label: string, ...children: HTMLElement[]) {
  const s = document.createElement('section');
  const h = document.createElement('h3');
  h.textContent = label;
  s.append(h, ...children);
  return s;
}
