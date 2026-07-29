import { useCallback, useState } from 'react';
import type { ChatAttachment, ChatDocumentSource } from '../types/chat';
import { imageFileToAttachment, isImageFile, MAX_CHAT_IMAGES } from '../utils/chatAttachments';
import { documentFileToSource, isDocumentFile, MAX_CHAT_DOCUMENTS } from '../utils/chatDocuments';

export function useChatAttachments() {
  const [attachments, setAttachments] = useState<Array<ChatAttachment | ChatDocumentSource>>([]);
  const [error, setError] = useState<string | null>(null);

  const addFiles = useCallback(async (files: File[]) => {
    const accepted = files.filter(file => isImageFile(file) || isDocumentFile(file));
    if (!accepted.length) {
      setError('不支持此文件格式');
      return;
    }

    setError(null);
    const results = await Promise.allSettled(accepted.map(file =>
      isImageFile(file) ? imageFileToAttachment(file) : documentFileToSource(file)
    ));
    const added = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    const failed = results.find(result => result.status === 'rejected');
    if (failed?.status === 'rejected') setError(errorMessage(failed.reason));

    setAttachments(previous => {
      const images = [...previous.filter(item => item.type === 'image'), ...added.filter(item => item.type === 'image')]
        .slice(0, MAX_CHAT_IMAGES);
      const documents = [...previous.filter(item => item.type === 'document'), ...added.filter(item => item.type === 'document')]
        .slice(0, MAX_CHAT_DOCUMENTS);
      return [...documents, ...images];
    });
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments(previous => previous.filter(item => item.id !== id));
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
    setError(null);
  }, []);

  return { attachments, error, addFiles, removeAttachment, clearAttachments };
}

function errorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  if (code === 'DOCUMENT_TOO_LARGE') return '文档超过 20 MB，无法在本机解析';
  if (code === 'IMAGE_TOO_LARGE') return '图片超过 10 MB，无法添加';
  if (code === 'UNSUPPORTED_DOCUMENT') return '不支持此文档格式';
  return '文档解析失败；扫描件请先转为可复制文本或图片';
}
