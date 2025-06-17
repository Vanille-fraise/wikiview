import ELK, {
  type ElkNode,
  type LayoutOptions,
} from "elkjs/lib/elk.bundled.js";
import { type Node, type Edge, EdgeTypes } from "@xyflow/react";
import {
  CENTER_NODE_HEIGHT,
  CENTER_NODE_WIDTH,
  CENTER_NODE_Y_OFFSET,
} from "./variables";

const elk = new ELK();
type ElkLayoutOptions = LayoutOptions;

const LAYOUT_TYPE = "org.eclipse.elk.radial";
// const LAYOUT_TYPE = "org.eclipse.elk.force";

// Default options that can be overridden.
const defaultOptions: ElkLayoutOptions = {
  "elk.algorithm": LAYOUT_TYPE,
  "elk.layered.spacing.nodeNodeBetweenLayers": "100",
  "elk.spacing.nodeNode": "80",
  "org.eclipse.elk.radial.centerOnRoot": "true",
};

export const getLayoutedElements = async (
  nodes: Node[],
  edges: Edge[]
): Promise<Node[]> => {
  const graph: ElkNode = {
    id: "root",
    layoutOptions: defaultOptions,
    children: nodes.map((node) => ({
      ...node,
      width:
        node.id == nodes[0].id
          ? CENTER_NODE_WIDTH
          : node.measured?.width ?? 150,
      height:
        node.id == nodes[0].id
          ? CENTER_NODE_HEIGHT
          : node.measured?.height ?? 50,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  try {
    const layoutedGraph = await elk.layout(graph);

    if (!layoutedGraph.children) {
      console.error("ELK layout failed:");
      return nodes;
    }

    return layoutedGraph.children.map((layoutedNode) => {
      const originalNode = nodes.find((n) => n.id === layoutedNode.id);

      return {
        ...(originalNode || {}),
        id: layoutedNode.id,
        position: {
          x: layoutedNode.x,
          y:
            originalNode?.id == nodes[0].id
              ? (layoutedNode.y ?? 0) + CENTER_NODE_Y_OFFSET
              : layoutedNode.y,
        },
      } as Node;
    });
  } catch (error) {
    console.error("ELK layout failed:", error);
    return nodes;
  }
};
