import React, { useCallback, useEffect, useState } from "react";
import {
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  ReactFlow,
  ReactFlowProvider,
  Edge,
  Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { fromView } from "@/code/types/graphInfo";
import { loadingView } from "@/code/types/view";
import { getLayoutedElements } from "@/code/lib/layout";
import CenterNode from "@/code/types/CenterNode";

const nodeTypes = {
  centerNode: CenterNode,
};

function Flow({
  page,
  setPage,
}: {
  page: string;
  setPage: React.Dispatch<React.SetStateAction<string>>;
}) {
  const loadingGraph = fromView(loadingView);
  const [nodes, setNodes, onNodesChange] = useNodesState(loadingGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(loadingGraph.edges);
  const reactFlow = useReactFlow();
  reactFlow.fitView();

  const onConnect = useCallback(
    (params: any) =>
      setEdges((eds) => {
        return addEdge(params, eds);
      }),
    [setEdges]
  );

  useEffect(() => {
    const setGraphInfoView = async (displayView: string) => {
      const viewResponse = await fetch(`/api/tools/viewManager/${displayView}`);
      if (viewResponse.ok) {
        const view = await viewResponse.json();
        var graphInfo = fromView(view);
        const layoutedNodes = await getLayoutedElements(
          graphInfo.nodes,
          graphInfo.edges
        );
        setNodes(layoutedNodes);
        setEdges(graphInfo.edges);
        reactFlow.fitView();
      }
    };
    page && setGraphInfoView(page);
  }, [page, setPage]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
      }}
    >
      <ReactFlow
        colorMode="dark"
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView={false}
        nodeTypes={nodeTypes}
        onClick={(e) => {
          if (e.target instanceof HTMLDivElement) {
            const dataId = e.target.getAttribute("data-id");
            const nodeName = nodes.find((node) => node.id == dataId)?.data
              .label;
            typeof nodeName == "string" && setPage(nodeName);
          }
        }}
      />
    </div>
  );
}

export default function FlowProvider({
  page,
  setPage,
}: {
  page: string;
  setPage: React.Dispatch<React.SetStateAction<string>>;
}) {
  return (
    <ReactFlowProvider>
      <Flow page={page} setPage={setPage} />
    </ReactFlowProvider>
  );
}
