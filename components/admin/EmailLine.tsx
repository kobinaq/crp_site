export function EmailLine({ email }: { email: string }) {
  if (!email) return <span>Not given</span>;
  return <span className="break-all">{email}</span>;
}
