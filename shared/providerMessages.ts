export interface ProviderAttachment {
  type?: string;
  name?: string;
  mimeType?: string;
  dataUrl?: string;
}

export interface ProviderChatMessage {
  role: string;
  content?: string;
  attachments?: ProviderAttachment[];
  documentContext?: string;
}

export function imageAttachments(message: ProviderChatMessage): ProviderAttachment[] {
  return (message.attachments ?? []).filter(a =>
    a?.type === 'image' &&
    typeof a.dataUrl === 'string' &&
    /^data:image\/[a-z0-9.+-]+;base64,/i.test(a.dataUrl)
  );
}

export function hasImageAttachments(messages: ProviderChatMessage[]): boolean {
  return messages.some(m => imageAttachments(m).length > 0);
}

export function imageAttachmentNote(message: ProviderChatMessage): string {
  const images = imageAttachments(message);
  if (!images.length) return '';
  return `\n[用户附图：${images.map(a => a.name || a.mimeType || 'image').join('、')}]`;
}

export function documentContextNote(message: ProviderChatMessage): string {
  const context = message.documentContext?.trim();
  return context ? `\n\n${context}` : '';
}

export function providerText(message: ProviderChatMessage): string {
  return `${message.content?.trim() || ''}${documentContextNote(message)}`.trim();
}

export function toOpenAiMessages(messages: ProviderChatMessage[], includeImages: boolean): any[] {
  return messages.map(message => {
    const role = message.role === 'model' ? 'assistant' : 'user';
    const content = providerText(message);
    const images = includeImages && role === 'user' ? imageAttachments(message) : [];
    if (!images.length) {
      const note = includeImages ? '' : imageAttachmentNote(message);
      return { role, content: `${content}${note}`.trim() };
    }

    return {
      role,
      content: [
        { type: 'text', text: content || '请识别这张图片，并按我的上下文回答。' },
        ...images.map(image => ({
          type: 'image_url',
          image_url: { url: image.dataUrl, detail: 'auto' },
        })),
      ],
    };
  });
}
