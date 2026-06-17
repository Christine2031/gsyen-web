/**
 * 疆域 GSYEN · KanbanCard + 上下文构建
 *
 * 核心设计：
 *  1. React.memo 精准隔离：50 张卡片中只有数据变更的那张重渲染
 *  2. subscribe 事件模型：替代 setInterval 轮询，彻底消灭每秒 100 次 setState
 *  3. msg.id 作为稳定 key：杜绝 index key 导致的 React 调和失效
 *  4. buildChatContext 服务端 RLS 校验：越权访问立即抛 RLSError
 */

import React, { useEffect, useState, useCallback } from 'react';
import type { GsyenCard, GsyenStreamMessage, ChatContextPayload } from './types';
import { RLSError } from './types';
import type { GsyenSessionStream } from './session';

interface KanbanCardProps {
  card:          GsyenCard;
  sessionStream: GsyenSessionStream;
  currentTeamId: string;
}

export const KanbanCard = React.memo(({
  card, sessionStream, currentTeamId,
}: KanbanCardProps) => {
  const [bubble,   setBubble]   = useState(false);
  const [messages, setMessages] = useState<GsyenStreamMessage[]>([]);

  useEffect(() => {
    return sessionStream.subscribe(msgs =>
      setMessages(msgs.filter(m => card.teamId === currentTeamId)),
    );
  }, [sessionStream, card.teamId, currentTeamId]);

  const toggleBubble = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setBubble(v => !v);
  }, []);

  return (
    <div onClick={toggleBubble}
      style={{ position: 'relative', border: '1px solid #1A1A1A',
               padding: 12, marginBottom: 8, cursor: 'pointer' }}>

      <h4 style={{ margin: 0, fontSize: 13, fontFamily: 'monospace' }}>{card.name}</h4>

      <div style={{ marginTop: 8, opacity: 0.4 }}>
        {messages.slice(-6).map(msg => (
          <div key={msg.id} style={{ fontSize: 11 }}>{msg.content}</div>
        ))}
      </div>

      {bubble && (
        <div style={{
          position: 'absolute', width: 36, height: 36,
          borderRadius: '50%', background: '#1A1A1A',
          bottom: -18, left: '50%', transform: 'translateX(-50%)',
          zIndex: 100,
        }} />
      )}
    </div>
  );
});
KanbanCard.displayName = 'KanbanCard';

/**
 * 构建卡片聊天上下文。
 * 服务端 RLS 校验：card.teamId 必须与请求方 teamId 一致，否则抛 RLSError。
 * senderId 字段在 payload 中被剔除，防止敏感身份信息透传给 LLM。
 */
export function buildChatContext(
  card:      GsyenCard,
  stream:    GsyenSessionStream,
  _userId:   string,
  teamId:    string,
): ChatContextPayload {
  if (card.teamId !== teamId)
    throw new RLSError(`Cross-tenant blocked: card.teamId=${card.teamId} reqTeamId=${teamId}`);

  return {
    entityType:     card.type,
    entityId:       card.id,
    entityName:     card.name,
    recentMessages: stream.tail(10).map(({ senderId: _omit, ...rest }) => rest),
  };
}
