import { MailApiError } from '../services/mailApi';

const RETRYABLE_CODES = new Set([
  'auth_required',
  'mail_api_timeout',
  'mail_api_unavailable',
  'mailbox_not_found',
]);

export const MAIL_SYNC_RETRY_DELAY_MS = 750;

export function isRetryableMailSyncError(error: unknown): boolean {
  if (!(error instanceof MailApiError)) return false;
  return RETRYABLE_CODES.has(error.code) || error.status >= 500;
}

export function waitForMailSyncRetry(delayMs = MAIL_SYNC_RETRY_DELAY_MS): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, delayMs));
}
