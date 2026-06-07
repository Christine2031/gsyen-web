import React, { useState, useCallback } from 'react';
import { ColumnId } from '../types/schedule';

interface UseDragDropReturn {
  draggingId: string | null;
  dragOverColumn: ColumnId | null;
  dragOverDate: string | null;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd:   () => void;
  onDragOverColumn: (e: React.DragEvent, col: ColumnId) => void;
  onDragOverDate:   (e: React.DragEvent, dateStr: string) => void;
  /** Returns the dragged event id, or null if nothing was dragged */
  onDropColumn: (e: React.DragEvent) => string | null;
  onDropDate:   (e: React.DragEvent) => string | null;
}

export function useDragDrop(): UseDragDropReturn {
  const [draggingId, setDraggingId]       = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<ColumnId | null>(null);
  const [dragOverDate, setDragOverDate]   = useState<string | null>(null);

  const onDragStart = useCallback((e: React.DragEvent, id: string) => {
    setDraggingId(id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const onDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverColumn(null);
    setDragOverDate(null);
  }, []);

  const onDragOverColumn = useCallback((e: React.DragEvent, col: ColumnId) => {
    e.preventDefault();
    setDragOverColumn(col);
  }, []);

  const onDragOverDate = useCallback((e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    setDragOverDate(dateStr);
  }, []);

  const onDropColumn = useCallback((e: React.DragEvent): string | null => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || draggingId;
    setDraggingId(null);
    setDragOverColumn(null);
    return id ?? null;
  }, [draggingId]);

  const onDropDate = useCallback((e: React.DragEvent): string | null => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || draggingId;
    setDraggingId(null);
    setDragOverDate(null);
    return id ?? null;
  }, [draggingId]);

  return {
    draggingId, dragOverColumn, dragOverDate,
    onDragStart, onDragEnd,
    onDragOverColumn, onDragOverDate,
    onDropColumn, onDropDate,
  };
}
