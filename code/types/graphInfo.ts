import { View } from '../types/view';

export interface Node {
    id: string,
    position: { x: number; y: number },
    data: { label: string }
}

export interface Edge {
    id: string;
    source: string;
    target: string;
}

export interface GraphInfo {
    nodes : Node[],
    edges : Edge[]       
}

export function fromView(view : View) : GraphInfo {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    const mainNode: Node = {
        id: view.id,
        position: { x: 0, y: 0 },
        data: { label: view.name },
    };
    nodes.push(mainNode);

    view.links.forEach((link, index) => {
        const linkNode: Node = {
            id: link.id,
            position: { x: 0, y: 0 },
            data: { label: link.name },
        };
        nodes.push(linkNode);

        const edge: Edge = {
            id: `e-${view.id}-${link.id}`,
            source: view.id,
            target: link.id,
        };
        edges.push(edge);
    });

    return { nodes, edges };
}
