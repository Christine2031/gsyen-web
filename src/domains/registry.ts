import { DomainHandler } from './types';
import { chronosHandler } from './chronosHandler';
import { ledgerHandler } from './ledgerHandler';

/**
 * All domain handlers known to the chat router.
 * To add VAULT/CANVAS: write a handler implementing DomainHandler
 * and push it here — useChatStream needs zero changes.
 *
 * Order matters: first handler whose detectIntent matches wins.
 */
export const domainHandlers: DomainHandler[] = [
  chronosHandler,
  ledgerHandler,
];
