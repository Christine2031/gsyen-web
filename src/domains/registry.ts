import { DomainHandler } from './types';
import { chronosHandler } from './chronosHandler';
import { ledgerHandler } from './ledgerHandler';
import { paymentHandler } from './paymentHandler';

/**
 * All domain handlers known to the chat router.
 * To add VAULT/CANVAS: write a handler implementing DomainHandler
 * and push it here — useChatStream needs zero changes.
 *
 * Order matters: first handler whose detectIntent matches wins.
 */
export const domainHandlers: DomainHandler[] = [
  chronosHandler,
  paymentHandler,  // 比 ledgerHandler 更具体（"收款码/扫码收款"等），需先判定，避免被宽泛的记账关键词抢跑
  ledgerHandler,
];
