const EMAIL_RE = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

/** Returns a human-readable problem with the address, or null if it looks valid. */
export function emailProblem(raw: string | null | undefined): string | null {
  const email = (raw ?? "").trim();
  if (!email) return "Enter the customer's email address.";
  if (EMAIL_RE.test(email)) return null;

  const nonAscii = [...email].find((ch) => ch.charCodeAt(0) > 127);
  if (nonAscii)
    return `Contains a non-Latin character "${nonAscii}" — probably typed with another keyboard layout.`;
  const separator = email.match(/[,;\s]/)?.[0];
  if (separator)
    return separator.trim()
      ? `Remove the "${separator}" — only one email address is allowed.`
      : "Email addresses can't contain spaces.";
  if (!email.includes("@")) return 'Missing the "@".';
  return "This doesn't look like a valid email address.";
}
