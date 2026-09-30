const NAMES: [number, string][] = [
  [40, 'Grave'], [50, 'Largo'], [55, 'Lento'], [60, 'Larghetto'], [72, 'Adagio'], [76, 'Adagietto'],
  [97, 'Andante'], [119, 'Moderato'], [155, 'Allegro'], [175, 'Vivace'], [199, 'Presto'],
];

/** Italian tempo marking for a BPM (upper bounds inclusive). */
export function tempoName(bpm: number): string {
  for (const [max, name] of NAMES) if (bpm <= max) return name;
  return 'Prestissimo';
}
