import React, { useCallback } from 'react';
import { ReactFlow, useNodesState, useEdgesState, addEdge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {GraphInfo, fromView} from '../code/types/graphInfo';
import { readOrCreateView } from '@/pages/api/tools/viewManager';

const INITIAL_PAGE = "fenetre";

export default async function App() {

  var view = await readOrCreateView(INITIAL_PAGE);
  var graphInfo = fromView(view);

  console.log(graphInfo);

  /* const [nodes, setNodes, onNodesChange] = useNodesState(graphInfo.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graphInfo.edges);
 
  const onConnect = useCallback(
    (params: any) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );
  */
 
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReactFlow
        nodes={graphInfo.nodes}
        edges={graphInfo.edges}
        // onNodesChange={onNodesChange}
        // onEdgesChange={onEdgesChange}
        // onConnect={onConnect}
      />
    </div>
  );
}