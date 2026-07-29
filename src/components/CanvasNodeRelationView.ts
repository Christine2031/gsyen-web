import { MarkerType, type Edge, type Node } from '@xyflow/react';

const EDGE_COLOR = 'rgba(126,136,154,0.26)';
const EDGE_STYLE = { stroke: EDGE_COLOR, strokeWidth: 2.2, strokeLinecap: 'round' as const };
const EDGE_MARKER = { type: MarkerType.ArrowClosed, color: EDGE_COLOR, width: 14, height: 14 };
const EDGE_CURVATURE = 0.34;
const EDGE_LABEL_BG = '#EEEDF6';
const EDGE_LABEL_PADDING: [number, number] = [6, 4];
const RELATION_EDGE_COLOR = 'rgba(96,108,128,0.46)';
const DRILLDOWN_EDGE_COLOR = 'rgba(96,108,128,0.30)';
const MUTED_EDGE_COLOR = 'rgba(126,136,154,0.07)';
const RELATED_NODE_OPACITY = 1;
const UNRELATED_NODE_OPACITY = 0.34;
const DRILLDOWN_NODE_OPACITY = 0.18;

export const EDGE_DEFAULTS = {
  style: EDGE_STYLE,
  markerEnd: EDGE_MARKER,
  pathOptions: { curvature: EDGE_CURVATURE },
  animated: false,
};

function portalChildren(node: Node | undefined) {
  const ids = (node?.data as any)?.childIds;
  return Array.isArray(ids) ? ids.filter(Boolean) as string[] : [];
}

function markerFor(color: string) {
  return { type: MarkerType.ArrowClosed, color, width: 14, height: 14 };
}

function edgeStyleFor(color: string) {
  return { stroke: color, strokeWidth: 2.2, strokeLinecap: 'round' as const, transition: 'stroke 0.16s ease' };
}

function nodeSize(node: Node) {
  const data = node.data as any;
  const style = node.style as any;
  return {
    w: Number(data?.width ?? style?.width ?? node.measured?.width ?? 250),
    h: Number(data?.height ?? style?.height ?? node.measured?.height ?? 100),
  };
}

function nodeCenter(node: Node) {
  const size = nodeSize(node);
  return { x: node.position.x + size.w / 2, y: node.position.y + size.h / 2 };
}

function rerouteParentChild(edge: Edge, parent: Node, child: Node, parentIsSource: boolean) {
  const from = nodeCenter(parent);
  const to = nodeCenter(child);
  const horizontal = Math.abs(to.x - from.x) > Math.abs(to.y - from.y);
  let parentSide = 'b';
  let childSide = 't';

  if (horizontal) {
    parentSide = to.x >= from.x ? 'r' : 'l';
    childSide = to.x >= from.x ? 'l' : 'r';
  } else {
    parentSide = to.y >= from.y ? 'b' : 't';
    childSide = to.y >= from.y ? 't' : 'b';
  }

  return parentIsSource
    ? { ...edge, sourceHandle: `src-${parentSide}`, targetHandle: `tgt-${childSide}` }
    : { ...edge, sourceHandle: `src-${childSide}`, targetHandle: `tgt-${parentSide}` };
}

function hasEdgeLabel(edge: Edge) {
  return String(edge.label ?? '').trim().length > 0;
}

function edgeLabelStyle(kind: 'default' | 'related' | 'muted') {
  const fill = kind === 'related'
    ? 'rgba(51,58,72,0.82)'
    : kind === 'muted'
      ? 'rgba(80,88,104,0.22)'
      : 'rgba(64,70,86,0.58)';
  return {
    fill,
    fontSize: 13,
    fontWeight: 500,
    fontFamily: '"HarmonyOS Sans SC","HarmonyOS Sans","Inter","PingFang SC","Microsoft YaHei UI",system-ui,sans-serif',
  };
}

function edgeLabelBgStyle(kind: 'default' | 'related' | 'muted') {
  return {
    fill: EDGE_LABEL_BG,
    fillOpacity: kind === 'muted' ? 0.52 : 0.9,
  };
}

function presentEdge(edge: Edge, color: string, kind: 'default' | 'related' | 'muted') {
  const showLabel = hasEdgeLabel(edge);
  return {
    ...edge,
    style: edgeStyleFor(color),
    markerEnd: markerFor(color),
    pathOptions: { curvature: EDGE_CURVATURE },
    labelStyle: edgeLabelStyle(kind),
    labelShowBg: showLabel,
    labelBgStyle: edgeLabelBgStyle(kind),
    labelBgPadding: EDGE_LABEL_PADDING,
    labelBgBorderRadius: 5,
    zIndex: 0,
  };
}

export function buildRelationView(nodes: Node[], edges: Edge[], focusPortalId?: string | null) {
  if (focusPortalId) {
    const focus = nodes.find(n => n.id === focusPortalId);
    const childIds = portalChildren(focus);
    const activeNodeIds = new Set([focusPortalId, ...childIds]);
    const directChildIds = new Set(childIds);
    const nodesById = new Map(nodes.map(node => [node.id, node]));
    return {
      nodes: nodes.map(node => {
        const active = activeNodeIds.has(node.id);
        return {
          ...node,
          style: {
            ...node.style,
            opacity: active ? RELATED_NODE_OPACITY : DRILLDOWN_NODE_OPACITY,
            transition: 'opacity 0.18s ease',
          },
        };
      }),
      edges: edges.map(edge => {
        const related = activeNodeIds.has(edge.source) && activeNodeIds.has(edge.target);
        const childFromParent = edge.source === focusPortalId && directChildIds.has(edge.target);
        const childToParent = edge.target === focusPortalId && directChildIds.has(edge.source);
        const routed = childFromParent && focus
          ? rerouteParentChild(edge, focus, nodesById.get(edge.target)!, true)
          : childToParent && focus
            ? rerouteParentChild(edge, focus, nodesById.get(edge.source)!, false)
            : edge;
        return presentEdge(routed, related ? DRILLDOWN_EDGE_COLOR : MUTED_EDGE_COLOR, related ? 'related' : 'muted');
      }),
    };
  }

  const selectedIds = new Set(nodes.filter(n => n.selected).map(n => n.id));
  if (selectedIds.size === 0) {
    return { nodes, edges: edges.map(edge => presentEdge(edge, EDGE_COLOR, 'default')) };
  }

  const relatedNodeIds = new Set(selectedIds);
  const relatedEdgeIds = new Set<string>();

  edges.forEach(edge => {
    const related = selectedIds.has(edge.source) || selectedIds.has(edge.target);
    if (!related) return;
    relatedEdgeIds.add(edge.id);
    relatedNodeIds.add(edge.source);
    relatedNodeIds.add(edge.target);
  });

  return {
    nodes: nodes.map(node => {
      const related = relatedNodeIds.has(node.id);
      return {
        ...node,
        style: {
          ...node.style,
          opacity: related ? RELATED_NODE_OPACITY : UNRELATED_NODE_OPACITY,
          transition: 'opacity 0.16s ease',
        },
      };
    }),
    edges: edges.map(edge => {
      const related = relatedEdgeIds.has(edge.id);
      const color = related ? RELATION_EDGE_COLOR : MUTED_EDGE_COLOR;
      return presentEdge(edge, color, related ? 'related' : 'muted');
    }),
  };
}
