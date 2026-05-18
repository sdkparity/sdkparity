const SECRET_PATTERNS = [
  /([A-Za-z0-9_]*TOKEN[A-Za-z0-9_]*=)[^"'\s]+/gi,
  /([A-Za-z0-9_]*SECRET[A-Za-z0-9_]*=)[^"'\s]+/gi,
  /(postgres(?:ql)?:\/\/)[^"'\s]+/gi,
  /(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi
];

export function redactSecrets(value: string): string {
  return SECRET_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, (_match, prefix: string) => `${prefix}[REDACTED]`),
    value
  );
}
