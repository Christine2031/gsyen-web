import { MailApiError } from '../services/mailApi';

const RETRYABLE_CODES = new Set(['auth_required', 'mail_api_timeout', 'mail_api_unavailable', 'mailbox_not_found']);
export const MAIL_SYNC_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000] as const;
export const MAIL_SYNC_RETRY_DELAY_MS = MAIL_SYNC_RETRY_DELAYS_MS[0];

export function isRetryableMailSyncError(error: unknown): boolean {
  return error instanceof MailApiError && (RETRYABLE_CODES.has(error.code) || error.status >= 500);
}

export function waitForMailSyncRetry(attempt = 0): Promise<void> {
  const delayMs = MAIL_SYNC_RETRY_DELAYS_MS[Math.min(attempt, MAIL_SYNC_RETRY_DELAYS_MS.length - 1)];
  return new Promise(resolve => window.setTimeout(resolve, delayMs));
}
