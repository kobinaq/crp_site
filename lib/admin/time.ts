const STAMP = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;

export function relativeWhen(stamp: string, now = Date.now()): { readonly label: string; readonly title: string } | null {
  const match = STAMP.exec(stamp);
  if (!match) return null;
  const then = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
  const title = `${stamp} UTC`;
  const minutes = Math.round((now - then) / 60_000);
  if (Math.abs(minutes) < 1) return { label: "Just now", title };
  if (minutes < 0) return { label: stamp, title };
  if (minutes < 60) return { label: minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`, title };
  const hours = Math.round(minutes / 60);
  if (hours < 24) return { label: hours === 1 ? "1 hour ago" : `${hours} hours ago`, title };
  const days = Math.round(hours / 24);
  if (days === 1) return { label: "Yesterday", title };
  if (days < 7) return { label: `${days} days ago`, title };
  return { label: stamp.slice(0, 10), title };
}
