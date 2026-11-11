import { expect, it } from 'vitest';
import { uploadBatch } from './upload-batch';

const file = (name: string) => new File(['x'], name);

it('uploads every file and reports progress', async () => {
  const seen: string[] = [];
  const progress: number[] = [];
  const result = await uploadBatch(
    [
      file('a.md'),
      file('b.md'),
      file('c.md'),
      file('d.md'),
    ],
    async (f) => {
      seen.push(f.name);
    },
    p => progress.push(p.done),
  );

  expect(result).toEqual({ uploaded: 4, failures: [] });
  expect(seen.sort()).toEqual(['a.md', 'b.md', 'c.md', 'd.md']);
  expect(progress.at(-1)).toBe(4);
});

it('keeps going after a failure and reports it by filename', async () => {
  const result = await uploadBatch(
    [
      file('ok.md'),
      file('bad.pdf'),
      file('ok2.md'),
    ],
    async (f) => {
      if (f.name === 'bad.pdf')
        throw new Error('nope');
    },
  );

  expect(result.uploaded).toBe(2);
  expect(result.failures.map(f => f.filename)).toEqual(['bad.pdf']);
});

it('never runs more uploads at once than the limit', async () => {
  let active = 0;
  let peak = 0;
  await uploadBatch(
    Array.from({ length: 8 }, (_, i) => file(`f${i}.md`)),
    async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active -= 1;
    },
    undefined,
    3,
  );

  expect(peak).toBe(3);
});

it('handles an empty selection', async () => {
  expect(await uploadBatch([], async () => {})).toEqual({ uploaded: 0, failures: [] });
});
