/**
 * Purpose: Resolve whether local development should auto-enable HTTPS certificates.
 */
export function shouldEnableDevHttps(value: string | undefined): boolean {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export function shouldUseHttps(input: { nodeEnv: string | undefined; devHttps: string | undefined }): boolean {
  return input.nodeEnv === 'production' || shouldEnableDevHttps(input.devHttps);
}
