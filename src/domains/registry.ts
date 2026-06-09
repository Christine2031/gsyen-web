import { DomainHandler } from './types';
import { chronosHandler } from './chronosHandler';
import { ledgerHandler } from './ledgerHandler';
import { paymentHandler } from './paymentHandler';
import { mailHandler } from './mailHandler';
import { vaultHandler } from './vaultHandler';
import { orderHandler } from './orderHandler';
import { canvasHandler } from './canvasHandler';

/**
 * All domain handlers known to the chat router.
 * resolveHandler() 处理多命中冲突（见 useChatStream），这里顺序只作兜底。
 */
export const domainHandlers: DomainHandler[] = [
  orderHandler,    // 订单：dominates LEDGER
  mailHandler,     // 先判，避免"给xxx写邮件"被 chronos 误抢
  canvasHandler,   // 文档/画板："写文档/新建笔记/画板"
  vaultHandler,    // 密钥存储，关键词独立无歧义
  chronosHandler,
  paymentHandler,
  ledgerHandler,
];
