import React, { RefObject } from "react";
import { Plus, Mic, Globe, ChevronDown, ArrowUp } from "lucide-react";

interface ChatInputProps {
  textareaRef: RefObject<HTMLTextAreaElement>;
  inputValue: string;
  setInputValue: (v: string) => void;
  isStreaming: boolean;
  isWebSearch: boolean;
  onToggleWebSearch: () => void;
  selectedModel: "gemini" | "kimi";
  onToggleModel: () => void;
  onSubmit: () => void;
  lang: "zh" | "en";
  t: {
    inputPlaceholder: string;
    modelGemini: string;
    modelKimi: string;
  };
  shadowStyle?: string;
}

export default function ChatInput({
  textareaRef,
  inputValue,
  setInputValue,
  isStreaming,
  isWebSearch,
  onToggleWebSearch,
  selectedModel,
  onToggleModel,
  onSubmit,
  lang,
  t,
  shadowStyle = "shadow-[0_4px_22px_rgba(0,0,0,0.07)]",
}: ChatInputProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="relative"
    >
      <div
        className={`flex flex-col w-full rounded-[24px] ${shadowStyle} border border-transparent bg-[var(--bg-input)] focus-within:border-neutral-300/80 dark:focus-within:border-neutral-600/70 focus-within:shadow-[0_6px_24px_rgba(0,0,0,0.07)] transition-all overflow-hidden`}
        id="input-container-wrapper"
      >
        {/* Text area */}
        <div className="relative w-full">
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
            placeholder={t.inputPlaceholder}
            className="w-full pt-5 pb-2 px-6 text-[14px] bg-transparent text-[var(--text-input)] outline-none resize-none overflow-y-hidden max-h-52 placeholder-[var(--text-muted)]/40"
            style={{ fontWeight: 500, lineHeight: "1.6" }}
            disabled={isStreaming}
            id="input-text-area"
          />
        </div>

        {/* Bottom toolbar */}
        <div
          className="flex items-center justify-between px-5 pb-3.5 pt-1.5 select-none"
          id="input-bottom-panel"
        >
          {/* Left: attachment, mic, web search */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-neutral-100/70 dark:hover:bg-neutral-800/60 transition cursor-pointer"
              title="Add attachments"
            >
              <Plus className="w-4.5 h-4.5 stroke-[2.3]" />
            </button>
            <button
              type="button"
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-neutral-100/70 dark:hover:bg-neutral-800/60 transition cursor-pointer"
              title={lang === "zh" ? "语音输入" : "Voice input"}
            >
              <Mic className="w-4.5 h-4.5 stroke-[2.3]" />
            </button>
            <button
              type="button"
              onClick={onToggleWebSearch}
              className={`flex items-center gap-1.5 px-2.5 py-[3px] rounded-full text-[12px] font-medium transition-all cursor-pointer select-none ${
                isWebSearch
                  ? "bg-neutral-200/90 dark:bg-neutral-700/90 text-[var(--text-main)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-neutral-100/70 dark:hover:bg-neutral-800/60"
              }`}
              title={lang === "zh" ? "全域搜索" : "Full search"}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{lang === "zh" ? "全域搜索" : "Full search"}</span>
            </button>
          </div>

          {/* Right: model selector + send button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleModel}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-neutral-100/70 dark:hover:bg-neutral-800/60 transition cursor-pointer font-sans select-none active:scale-95"
              title={lang === "zh" ? "点击切换模型" : "Click to switch model"}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                  selectedModel === "kimi" ? "bg-purple-500" : "bg-emerald-500"
                }`}
              />
              <span>{selectedModel === "kimi" ? t.modelKimi : t.modelGemini}</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-60" />
            </button>

            <button
              type="submit"
              disabled={!inputValue.trim() || isStreaming}
              className={`w-8.5 h-8.5 flex items-center justify-center rounded-[11px] transition-all duration-200 ${
                inputValue.trim() && !isStreaming
                  ? "bg-[var(--accent-color)] text-white hover:bg-[var(--accent-hover)] cursor-pointer shadow-md shadow-[var(--accent-color)]/20 active:scale-90"
                  : "bg-[var(--bg-card)] text-[var(--text-muted)]/30 cursor-default"
              }`}
              title="Send Message"
              id="message-send-button"
            >
              <ArrowUp className="w-4.5 h-4.5 stroke-[2.5]" />
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
