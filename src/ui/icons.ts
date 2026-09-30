const svg = (body: string, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true">${body}</svg>`;

export const icons = {
  play: svg('<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" fill="currentColor"/>'),
  pause: svg('<rect x="6" y="5" width="4.2" height="14" rx="1.2" fill="currentColor"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.2" fill="currentColor"/>'),
  notes: svg('<path d="M9 18V6.5l10-2V16" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><path d="M9 9.8l10-2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="6.5" cy="18" r="2.6" fill="currentColor"/><circle cx="16.5" cy="16" r="2.6" fill="currentColor"/>'),
  more: svg('<circle cx="5.5" cy="12" r="1.9" fill="currentColor"/><circle cx="12" cy="12" r="1.9" fill="currentColor"/><circle cx="18.5" cy="12" r="1.9" fill="currentColor"/>'),
  wave: svg('<g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 10v4M7 7v10M11 3v18M15 7v10M19 9.5v5"/></g>'),
};

/** Tiny strip showing where clicks fall within one beat. */
export function patternIcon(offsets: number[]) {
  const dots = offsets.map((o) => `<circle cx="${6 + o * 48}" cy="10" r="${o === 0 ? 4 : 3}" fill="currentColor" opacity="${o === 0 ? 1 : 0.7}"/>`).join('');
  return svg(`<path d="M6 10h48" stroke="currentColor" stroke-width="1" opacity=".3"/>${dots}`, '0 0 60 20');
}
