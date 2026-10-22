export type DiffLine = { readonly kind: "same" | "add" | "remove"; readonly text: string };

const LINE_CAP = 80;

export function lineDiff(before: string, after: string): readonly DiffLine[] {
  const older = before.split("\n");
  const newer = after.split("\n");
  if (older.length > LINE_CAP || newer.length > LINE_CAP) {
    const lines: DiffLine[] = [];
    for (const text of older) lines.push({ kind: "remove", text });
    for (const text of newer) lines.push({ kind: "add", text });
    return lines;
  }
  const scores = Array.from({ length: older.length + 1 }, () => Array<number>(newer.length + 1).fill(0));
  for (let i = older.length - 1; i >= 0; i--) {
    for (let j = newer.length - 1; j >= 0; j--) {
      const next = scores[i + 1]?.[j + 1] ?? 0;
      const down = scores[i + 1]?.[j] ?? 0;
      const right = scores[i]?.[j + 1] ?? 0;
      scores[i][j] = older[i] === newer[j] ? next + 1 : Math.max(down, right);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < older.length && j < newer.length) {
    if (older[i] === newer[j]) {
      out.push({ kind: "same", text: older[i] ?? "" });
      i += 1;
      j += 1;
    } else if ((scores[i + 1]?.[j] ?? 0) >= (scores[i]?.[j + 1] ?? 0)) {
      out.push({ kind: "remove", text: older[i] ?? "" });
      i += 1;
    } else {
      out.push({ kind: "add", text: newer[j] ?? "" });
      j += 1;
    }
  }
  while (i < older.length) {
    out.push({ kind: "remove", text: older[i] ?? "" });
    i += 1;
  }
  while (j < newer.length) {
    out.push({ kind: "add", text: newer[j] ?? "" });
    j += 1;
  }
  return out;
}
