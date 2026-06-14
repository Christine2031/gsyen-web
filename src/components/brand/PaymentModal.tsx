import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface PaymentModalProps {
  billing: 'month' | 'year';
  onClose: () => void;
}

export default function PaymentModal({ billing, onClose }: PaymentModalProps) {
  const isYear = billing === 'year';
  const amount = isYear ? '¥1,896' : '¥99';
  const amountNote = isYear ? '年付（¥158/月 × 12）' : '首月优惠价';
  const regularNote = isYear ? '原价 ¥2,376/年' : '次月起 ¥198/月';

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      >
        <motion.div
          className="relative bg-[#F9F8F6] flex flex-col items-center"
          initial={{ opacity: 0, scale: 0.92, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 8 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          style={{ padding: '32px 28px 28px', width: 300 }}
          onClick={e => e.stopPropagation()}
        >
          {/* 关闭 */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-5 h-5 flex items-center justify-center text-[#1A1A1A]/30 hover:text-[#1A1A1A]/70 transition-colors text-(--fs-md) font-mono"
          >
            ✕
          </button>

          {/* 金额 */}
          <p className="text-(--fs-2xs) font-mono font-bold tracking-[0.28em] uppercase text-[#1A1A1A]/35 mb-1">
            升级 PRO
          </p>
          <span className="text-[32px] font-black text-[#1A1A1A] leading-none mb-0.5">{amount}</span>
          <p className="text-(--fs-2xs) font-mono text-[#1A1A1A]/50 mb-0.5">{amountNote}</p>
          <p className="text-[7.5px] font-mono text-[#1A1A1A]/25 mb-5 line-through">{regularNote}</p>

          {/* 两码并排 */}
          <div className="flex items-start gap-3 w-full mb-5">
            {/* 付款码 */}
            <div className="flex flex-col items-center gap-1.5 flex-1">
              <p className="text-[7px] font-mono font-bold tracking-[0.2em] uppercase text-[#1A1A1A]/35">扫码付款</p>
              <div className="border border-[#1A1A1A]/8 p-1.5 bg-white">
                <img src="/wechat-pay-qr.png" alt="微信收款码"
                  className="w-[110px] h-[110px] object-contain"
                  onError={e => { (e.target as HTMLImageElement).style.opacity = '0.15'; }} />
              </div>
              <p className="text-[6.5px] font-mono text-[#1A1A1A]/35 text-center">微信扫码</p>
            </div>

            {/* 分隔 */}
            <div className="flex flex-col items-center self-stretch justify-center gap-1 pt-5">
              <div className="w-px flex-1 bg-[#1A1A1A]/8" />
              <span className="text-[7px] font-mono text-[#1A1A1A]/20">然后</span>
              <div className="w-px flex-1 bg-[#1A1A1A]/8" />
            </div>

            {/* 好友码 */}
            <div className="flex flex-col items-center gap-1.5 flex-1">
              <p className="text-[7px] font-mono font-bold tracking-[0.2em] uppercase text-[#1A1A1A]/35">加我确认</p>
              <div className="border border-[#1A1A1A]/8 p-1.5 bg-white">
                <img src="/wechat-friend-qr.png" alt="微信好友码"
                  className="w-[110px] h-[110px] object-contain"
                  onError={e => { (e.target as HTMLImageElement).style.opacity = '0.15'; }} />
              </div>
              <p className="text-[6.5px] font-mono text-[#1A1A1A]/35 text-center">李厚亿</p>
            </div>
          </div>

          {/* 说明 */}
          <div className="w-full border-t border-[#1A1A1A]/8 pt-3 flex flex-col gap-1">
            <p className="text-[7.5px] font-mono text-[#1A1A1A]/50 text-center leading-relaxed">
              付款后发送<span className="text-[#1A1A1A]/75 font-bold">支付截图 + 注册邮箱</span>
            </p>
            <p className="text-[7px] font-mono text-[#1A1A1A]/25 text-center">
              24小时内开通 · hello@gsyen.com
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
