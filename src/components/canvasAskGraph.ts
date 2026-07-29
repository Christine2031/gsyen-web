import type { Edge, Node } from '@xyflow/react';
import type { CardData, StatusColor } from './CanvasCardData';
import { EDGE_DEFAULTS } from './CanvasNodeRelationView';
import type { CodeSearchResult } from './canvasLocalCodeSearch';

interface AskGraphResult {
  nodes: Node[];
  edges: Edge[];
  focusPortalId: string | null;
}

const HEADER_FOLDER_ID = 'shell-drag-contract';
const ROOT_ID = 'gsyen-core';

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function nodeHeight(node: Node | undefined) {
  const data = node?.data as CardData | undefined;
  return Number(data?.height ?? node?.style?.height ?? (node as any)?.height ?? 180);
}

function folderIdFor(nodes: Node[], query: string) {
  if (/header|顶部|顶栏|隐藏|收起|拖|窗口|shell/i.test(query) && nodes.some(node => node.id === HEADER_FOLDER_ID)) {
    return HEADER_FOLDER_ID;
  }
  return `ask-session-${query.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 44) || 'local-code'}`;
}

function statusColorFor(accent: CodeSearchResult['accent']): StatusColor {
  if (accent === 'yellow') return 'yellow';
  if (accent === 'red') return 'red';
  if (accent === 'green') return 'green';
  return 'amber';
}

function resultText(result: CodeSearchResult) {
  return [
    `# ${result.title}`,
    result.relPath,
    `L${result.lineStart}-L${result.lineEnd}`,
    '',
    result.note,
  ].join('\n');
}

function resultData(result: CodeSearchResult, existing?: CardData): CardData {
  return {
    ...existing,
    text: resultText(result),
    entityName: result.title,
    entitySub: 'LOCAL CODE',
    contentType: 'code',
    cardType: 'solid',
    cardSize: existing?.cardSize ?? 'M',
    status: `L${result.lineStart}-L${result.lineEnd}`,
    statusColor: statusColorFor(result.accent),
    cardAccent: result.accent,
    cardElevation: 'flat',
    cardOpacity: 'solid',
    cardCorner: 'sm',
    cardDensity: 'compact',
    cardState: 'highlight',
    sourcePath: result.sourcePath,
    width: Number(existing?.width ?? 300),
    height: Number(existing?.height ?? 180),
  };
}

function sessionData(query: string, childIds: string[], existing?: CardData): CardData {
  return {
    ...existing,
    text: `# Ask GSYEN\n${query}\n\n${childIds.length} 个本地源码入口。\n双击文件夹展开，点源码卡直接看本地行号。`,
    entityName: 'Ask GSYEN · Local Code',
    entitySub: 'CODE SESSION',
    contentType: 'note',
    cardType: 'solid',
    cardSize: 'M',
    status: `${childIds.length} results`,
    statusColor: 'green',
    cardAccent: 'green',
    cardElevation: 'flat',
    cardOpacity: 'solid',
    cardCorner: 'sm',
    cardDensity: 'compact',
    cardState: 'highlight',
    childIds,
    portalExpanded: true,
    width: Number(existing?.width ?? 360),
    height: Number(existing?.height ?? 190),
  };
}

function missingPosition(folder: Node, index: number) {
  const col = index % 4;
  const row = Math.floor(index / 4);
  return {
    x: folder.position.x - 360 + col * 330,
    y: folder.position.y + nodeHeight(folder) + 110 + row * 220,
  };
}

function createSessionNode(id: string, nodes: Node[], query: string, childIds: string[]) {
  const root = nodes.find(node => node.id === ROOT_ID) ?? nodes[0];
  const position = root
    ? { x: root.position.x + 30, y: root.position.y + nodeHeight(root) + 70 }
    : { x: 720, y: 820 };
  return {
    id,
    type: 'card',
    position,
    data: sessionData(query, childIds),
    hidden: false,
  } as Node;
}

function hasParentEdge(edges: Edge[], folderId: string, childId: string) {
  return edges.some(edge =>
    (edge.source === folderId && edge.target === childId) ||
    (edge.source === childId && edge.target === folderId)
  );
}

export function applyCanvasAskResults(
  nodes: Node[],
  edges: Edge[],
  query: string,
  results: CodeSearchResult[],
): AskGraphResult {
  if (results.length === 0) return { nodes, edges, focusPortalId: null };

  const resultIds = results.map(result => result.id);
  const folderId = folderIdFor(nodes, query);
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const folder = nodeById.get(folderId) ?? createSessionNode(folderId, nodes, query, resultIds);
  const folderData = folder.data as CardData;
  const childIds = unique([...(folderData.childIds ?? []), ...resultIds]);
  const activeChildIds = new Set(childIds);
  const resultById = new Map(results.map(result => [result.id, result]));
  const createdIds = new Set<string>();
  let missingIndex = 0;

  const updatedNodes: Node[] = nodes.map(node => {
    const data = node.data as CardData;
    if (node.id === folderId) {
      const nextData = folderId === HEADER_FOLDER_ID
        ? { ...data, childIds, portalExpanded: true, cardState: 'highlight' as const }
        : sessionData(query, childIds, data);
      return { ...node, hidden: false, data: nextData };
    }
    const result = resultById.get(node.id);
    if (result) {
      createdIds.add(node.id);
      return {
        ...node,
        hidden: false,
        data: resultData(result, data),
      };
    }
    if (activeChildIds.has(node.id)) return { ...node, hidden: false };
    const isOtherChild = Boolean(data.parentPortalId);
    const isOtherPortal = Array.isArray(data.childIds) && data.childIds.length > 0;
    return {
      ...node,
      hidden: isOtherChild ? true : node.hidden,
      data: isOtherPortal ? { ...data, portalExpanded: false } : data,
    };
  });

  if (!nodeById.has(folderId)) updatedNodes.push(folder);

  for (const result of results) {
    if (createdIds.has(result.id)) continue;
    updatedNodes.push({
      id: result.id,
      type: 'card',
      position: missingPosition(folder, missingIndex++),
      data: {
        ...resultData(result),
        parentPortalId: folderId,
      },
      hidden: false,
    } as Node);
  }

  const nextEdges = [...edges];
  for (const resultId of resultIds) {
    if (hasParentEdge(nextEdges, folderId, resultId)) continue;
    nextEdges.push({
      id: `edge-ask-${folderId}-${resultId}`,
      source: folderId,
      target: resultId,
      sourceHandle: 'src-b',
      targetHandle: 'tgt-t',
      label: '本地代码',
      ...EDGE_DEFAULTS,
    });
  }

  return { nodes: updatedNodes, edges: nextEdges, focusPortalId: folderId };
}
