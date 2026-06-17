import React from 'react';

/** Inline **bold** parser */
function parseBoldText(text: string, isAI: boolean): React.ReactNode {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1
      ? <strong key={i} className={`font-bold font-sans ${isAI ? 'text-[#1A1A1A]' : 'text-white font-black'}`}>{part}</strong>
      : part
  );
}

/**
 * Render a markdown-lite message into React nodes.
 * Supports: **bold**, ## headings, ### headings, bullet lists, numbered lists, > blockquotes.
 */
export function renderMessageContent(text: string, isAI: boolean): React.ReactNode[] {
  // Strip action code blocks (schedule/ledger/etc.) — ActionCardView renders them visually
  const stripped = text.replace(/```\w+\n[\s\S]*?```/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return stripped.split('\n').map((line, i) => {
    // Blockquote > — 暗色引用块
    if (line.trim().startsWith('> ')) {
      return (
        <div key={i} className={`border-l-2 pl-3 my-1.5 font-sans text-xs leading-relaxed ${isAI ? 'border-[#CCCCCC] text-[#999999]' : 'border-white/30 text-white/45'}`}>
          {parseBoldText(line.trim().slice(2), isAI)}
        </div>
      );
    }
    // Bullet list
    if (/^[-*]\s/.test(line.trim())) {
      return (
        <li key={i} className={`list-disc list-inside ml-2.5 my-1.5 font-sans leading-relaxed text-xs ${isAI ? 'text-[#2F2F2F]' : 'text-white/90'}`}>
          {parseBoldText(line.trim().slice(2), isAI)}
        </li>
      );
    }
    // Numbered list
    const numMatch = line.trim().match(/^(\d+)\.\s(.*)/);
    if (numMatch) {
      return (
        <div key={i} className={`ml-3 my-1.5 flex gap-2 font-sans text-xs leading-relaxed ${isAI ? 'text-[#2F2F2F]' : 'text-white/95'}`}>
          <span className={`font-mono font-bold ${isAI ? 'text-[#1A1A1A]' : 'text-[#F9F8F6]'}`}>{numMatch[1]}.</span>
          <span className="flex-1">{parseBoldText(numMatch[2], isAI)}</span>
        </div>
      );
    }
    // H3
    if (line.trim().startsWith('### ')) {
      return <h4 key={i} className={`text-xs font-mono font-bold uppercase tracking-wider mt-4 mb-2 ${isAI ? 'text-[#1A1A1A]' : 'text-white'}`}>{line.trim().slice(4)}</h4>;
    }
    // H2
    if (line.trim().startsWith('## ')) {
      return <h3 key={i} className={`text-sm font-serif font-bold italic mt-5 mb-2.5 ${isAI ? 'text-[#1A1A1A]' : 'text-[#F9F8F6]'}`}>{line.trim().slice(3)}</h3>;
    }
    // Empty line
    if (line.trim() === '') return <div key={i} className="h-2.5" />;
    // Paragraph
    return (
      <p key={i} className={`leading-relaxed font-sans text-xs my-1 ${isAI ? 'text-[#2F2F2F]' : 'text-white'}`}>
        {parseBoldText(line, isAI)}
      </p>
    );
  });
}
