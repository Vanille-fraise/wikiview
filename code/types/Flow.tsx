import React, { useCallback, useEffect, useState } from "react";
import {
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { fromView, GraphInfo } from "@/code/types/graphInfo";
import { loadingView, View } from "@/code/types/view";
import { getLayoutedElements } from "@/code/lib/layout";
import CenterNode from "@/code/types/CenterNode";
import { sanitized, shuffle } from "../lib/utils";
import { LoadingStatus } from "@/pages/search/[searchParam]";

const nodeTypes = {
  centerNode: CenterNode,
};

function Flow({
  page,
  setPage,
  setLoadingStatus,
  setStartLoading,
  setFilterList,
  activeFilters,
  setActiveFilters,
}: {
  page: string;
  setPage: React.Dispatch<React.SetStateAction<string>>;
  setLoadingStatus: React.Dispatch<React.SetStateAction<LoadingStatus>>;
  setStartLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setFilterList: React.Dispatch<React.SetStateAction<string[]>>;
  activeFilters: string[];
  setActiveFilters: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const loadingGraph = fromView(loadingView, activeFilters);
  const [nodes, setNodes, onNodesChange] = useNodesState(loadingGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(loadingGraph.edges);
  const [displayedView, setDisplayedView] = useState<View>();
  const reactFlow = useReactFlow();
  reactFlow.fitView();

  const onConnect = useCallback(
    (params: any) =>
      setEdges((eds) => {
        return addEdge(params, eds);
      }),
    [setEdges]
  );

  async function updateNodesEdges(v: View, filters: string[]) {
    var curGraphInfo = fromView(v, filters);
    const layoutedNodes = await getLayoutedElements(
      curGraphInfo.nodes,
      curGraphInfo.edges
    );
    setNodes(layoutedNodes);
    setEdges(curGraphInfo.edges);
  }

  useEffect(() => {
    displayedView && updateNodesEdges(displayedView, activeFilters);
  }, [activeFilters]);

  useEffect(() => {
    const updateViewNodes = async (v: View, filters: string[]) => {
      const tagMap = new Map<string, number>();
      v.edges
        .map((e) => e.tags)
        .flat()
        .forEach((t) =>
          tagMap.set(sanitized(t), (tagMap.get(sanitized(t)) ?? 0) + 1)
        );
      setFilterList(
        [...tagMap.entries()]
          .sort((a, b) => b[1] - a[1])
          .filter((e) => e[1] > 1)
          .map((e) => e[0])
      );
      await updateNodesEdges(v, filters);
      reactFlow.fitView();
      setActiveFilters([]);
    };
    displayedView && updateViewNodes(displayedView, activeFilters);
  }, [displayedView]);

  useEffect(() => {
    const setGraphInfoView = async (displayView: string) => {
      setLoadingStatus(LoadingStatus.Start);
      setStartLoading(true);

      const viewResponse = await fetch(`/api/tools/viewManager/${displayView}`);
      if (viewResponse.ok) {
        const view: View = await viewResponse.json();
        view.edges = shuffle(view.edges);
        setDisplayedView(view);
        setLoadingStatus(LoadingStatus.Done);
      } else {
        setLoadingStatus(LoadingStatus.Error);
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
  setLoadingStatus,
  setStartLoading,
  activeFilters,
  setFilterList,
  setActiveFilters,
}: {
  page: string;
  setPage: React.Dispatch<React.SetStateAction<string>>;
  setLoadingStatus: React.Dispatch<React.SetStateAction<LoadingStatus>>;
  setStartLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setFilterList: React.Dispatch<React.SetStateAction<string[]>>;
  activeFilters: string[];
  setActiveFilters: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  return (
    <ReactFlowProvider>
      <Flow
        page={page}
        setPage={setPage}
        setLoadingStatus={setLoadingStatus}
        setStartLoading={setStartLoading}
        setFilterList={setFilterList}
        activeFilters={activeFilters}
        setActiveFilters={setActiveFilters}
      />
    </ReactFlowProvider>
  );
}
