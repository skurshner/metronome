import { expect, it } from 'vitest';
import { tempoName } from '../src/tempo';

it('names tempos', () => {
  expect(tempoName(75)).toBe('Adagietto');
  expect(tempoName(120)).toBe('Allegro');
  expect(tempoName(20)).toBe('Grave');
  expect(tempoName(400)).toBe('Prestissimo');
});
