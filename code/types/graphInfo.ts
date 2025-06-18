import { sanitized } from "../lib/utils";
import {
  BREAKDOWN_COLOR,
  HYBRID_COLOR,
  HYPER_COLOR,
  MAX_SIDE_NODES,
} from "../lib/variables";
import { View } from "../types/view";
import { Edge, Node } from "@xyflow/react";

export interface GraphInfo {
  nodes: Node[];
  edges: Edge[];
}

export function fromView(view: View, activeFilters: string[]): GraphInfo {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const mainNode: Node = {
    id: view.id,
    position: { x: 0, y: 0 },
    type: "centerNode",
    data: {
      view,
    },
  };
  nodes.push(mainNode);
  view.edges
    .filter((e) =>
      activeFilters ? activeFilters.every((f) => e.tags.includes(f)) : true
    )
    .slice(0, MAX_SIDE_NODES)
    .forEach((viewEdge, index) => {
      const linkNode: Node = {
        id: "n-" + viewEdge.destPageName,
        position: { x: (index + 1) * 100, y: (index + 1) * 100 },
        data: { label: viewEdge.destPageName },
      };
      nodes.push(linkNode);

      var strokeColor = "#ffffff";
      if (viewEdge.linkType == "hyper") {
        strokeColor = HYPER_COLOR;
      } else if (viewEdge.linkType == "breakDown") {
        strokeColor = BREAKDOWN_COLOR;
      } else {
        strokeColor = HYBRID_COLOR;
      }

      const graphEdge: Edge = {
        id: `e-${view.id}-${viewEdge.destPageName}`,
        source: view.id,
        target: linkNode.id,
        style: {
          strokeWidth:
            1 +
            ((viewEdge.relevance * viewEdge.relevance * viewEdge.relevance) /
              1000000) *
              7,
          stroke: strokeColor,
        },
      };
      edges.push(graphEdge);
    });

  return { nodes, edges };
}
