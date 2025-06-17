import ELK, {
  type ElkNode,
  type LayoutOptions,
} from "elkjs/lib/elk.bundled.js";
import { type Node, type Edge, EdgeTypes } from "@xyflow/react";

const elk = new ELK();
type ElkLayoutOptions = LayoutOptions;

const LAYOUT_TYPE = "org.eclipse.elk.radial";
// const LAYOUT_TYPE = "org.eclipse.elk.force";

// Default options that can be overridden.
const defaultOptions: ElkLayoutOptions = {
  "elk.algorithm": LAYOUT_TYPE,
  "elk.layered.spacing.nodeNodeBetweenLayers": "100",
  "elk.spacing.nodeNode": "80",
};

export const getLayoutedElements = async (
  nodes: Node[],
  edges: Edge[]
): Promise<Node[]> => {
  // Combine default options with the specific options for this layout run.

  const graph: ElkNode = {
    id: "root",
    layoutOptions: defaultOptions,
    children: nodes.map((node) => ({
      ...node,
      // ELK requires width and height for layout calculation.
      // Use measured dimensions if available, otherwise provide sensible defaults.
      width: node.measured?.width ?? 150,
      height: node.measured?.height ?? 50,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  try {
    // Run the ELK layout algorithm.
    const layoutedGraph = await elk.layout(graph);

    if (!layoutedGraph.children) {
      console.error("ELK layout failed:");
      // In case of an error, return the original nodes to avoid a crash.
      return nodes;
    }

    // Map the ELK layout result back to React Flow nodes.
    return layoutedGraph.children.map((layoutedNode) => {
      // Find the original node to preserve all its properties (data, style, etc.).
      const originalNode = nodes.find((n) => n.id === layoutedNode.id);

      return {
        ...(originalNode || {}), // Start with original node properties
        id: layoutedNode.id, // Ensure id is present
        position:
          originalNode?.id == nodes[0].id
            ? { x: 497.971 - 150, y: 497.971 - 80 - 30 }
            : { x: layoutedNode.x, y: layoutedNode.y }, // Apply new position
      } as Node; // Cast to Node type
    });
  } catch (error) {
    console.error("ELK layout failed:", error);
    return nodes;
  }
};
