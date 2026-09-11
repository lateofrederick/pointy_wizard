'use client';

import { useCallback, useState, useRef } from 'react';
import ReactFlow, {
  Background,
  Controls,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Node,
  NodeMouseHandler,
} from 'reactflow';
import 'reactflow/dist/style.css';
import EventNode from './EventNode';
import CodeEditor from './CodeEditor';
import MenuBar from './MenuBar';
import { usePipeline } from '../hooks/usePipeline';
import { PipelineNode, PipelineEdge, PipelineEvent, PipelineConfig } from '../types/pipeline';
import { validatePointyCode } from '../utils/pointy';

const nodeTypes = {
  event: EventNode,
};

const PipelineEditor = () => {
  const {
    nodes: initialNodes,
    edges: initialEdges,
    config,
    setNodes: setInitialNodes,
    setEdges: setInitialEdges,
    savePipeline,
    exportPipeline,
    importPipeline,
    createNewPipeline,
  } = usePipeline();

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedEvent, setSelectedEvent] = useState<PipelineEvent | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onConnect = useCallback(
    (params: Connection) => {
      const newEdges = addEdge(params, edges);
      setEdges(newEdges);
      setInitialEdges(newEdges as PipelineEdge[]);
      savePipeline();
    },
    [edges, setEdges, setInitialEdges, savePipeline]
  );

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    const pipelineNode = node as PipelineNode;
    setSelectedEvent(pipelineNode.data.event);
  }, []);

  const onNodesDelete = useCallback((deletedNodes: Node[]) => {
    const remainingNodes = nodes.filter(
      node => !deletedNodes.find(n => n.id === node.id)
    );
    setInitialNodes(remainingNodes as PipelineNode[]);
    savePipeline();
  }, [nodes, setInitialNodes, savePipeline]);

  const addNewEvent = useCallback(() => {
    if (!config.name) {
      alert('Please create a new pipeline first');
      return;
    }

    const newEvent: PipelineEvent = {
      id: `event-${Date.now()}`,
      name: 'New Event',
      code: '# Write your Python code here\n',
    };

    const newNode: PipelineNode = {
      id: newEvent.id,
      type: 'event',
      position: { x: 100, y: 100 },
      data: { event: newEvent },
    };

    const updatedNodes = [...nodes, newNode];
    setNodes(updatedNodes);
    setInitialNodes(updatedNodes as PipelineNode[]);
    savePipeline();
  }, [nodes, config.name, setNodes, setInitialNodes, savePipeline]);

  const updateEventCode = useCallback((code: string) => {
    if (!selectedEvent) return;

    const errors = validatePointyCode(code);
    if (errors.length > 0) {
      console.warn('Python code validation errors:', errors);
    }

    const updatedNodes = nodes.map((node) => {
      const pNode = node as PipelineNode;
      return pNode.data.event.id === selectedEvent.id
        ? {
            ...pNode,
            data: {
              event: {
                ...pNode.data.event,
                code,
              },
            },
          }
        : pNode;
    });

    setNodes(updatedNodes);
    setInitialNodes(updatedNodes as PipelineNode[]);
    savePipeline();
  }, [selectedEvent, nodes, setNodes, setInitialNodes, savePipeline]);

  const handleNewPipeline = useCallback((pipelineConfig: PipelineConfig) => {
    createNewPipeline(pipelineConfig);
  }, [createNewPipeline]);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.name.endsWith('.json')) {
      importPipeline(file);
    } else if (file.name.endsWith('.pointy')) {
      // TODO: Handle Pointy file import
    }
  }, [importPipeline]);

  return (
    <div className="w-full h-full flex flex-col">
      <MenuBar
        onNewPipeline={handleNewPipeline}
        onImport={handleImport}
        onExportJSON={exportPipeline}
        onExportPointy={() => {}} // TODO: Implement Pointy export
        onAddEvent={addNewEvent}
      />
      <div className="flex flex-1">
        <div className="w-3/4 h-[800px] relative">
          <div className="absolute top-0 left-0 right-0 bg-gray-100 p-2 z-10">
            {config.name ? (
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-semibold">{config.name}</h2>
                <span className="text-sm text-gray-500">
                  ({config.fields.length} fields)
                </span>
              </div>
            ) : (
              <div className="text-gray-500">
                No pipeline configured. Create a new pipeline from the File menu.
              </div>
            )}
          </div>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onNodesDelete={onNodesDelete}
            nodeTypes={nodeTypes}
            fitView
            className="bg-gray-50"
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>
        <div className="w-1/4 border-l">
          <CodeEditor 
            event={selectedEvent} 
            config={config}
            onCodeChange={updateEventCode} 
          />
        </div>
      </div>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".json,.pointy"
        className="hidden"
      />
    </div>
  );
};

export default PipelineEditor;