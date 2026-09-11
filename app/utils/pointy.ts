import { Pipeline, PipelineNode, PipelineEdge } from '../types/pipeline';

export const validatePointyCode = (code: string): string[] => {
  const errors: string[] = [];
  const lines = code.split('\n');

  // Basic Python syntax validation
  try {
    let indentLevel = 0;
    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        return;
      }

      // Check for obvious Python syntax issues
      if (trimmedLine.endsWith(':')) {
        indentLevel++;
      } else if (indentLevel > 0 && !line.startsWith(' ') && !line.startsWith('\t')) {
        errors.push(`Line ${index + 1}: Expected indentation`);
      }

      // Check for common Python syntax errors
      if (trimmedLine.includes(';')) {
        errors.push(`Line ${index + 1}: Semicolons are not typically used in Python`);
      }
    });
  } catch (error) {
    errors.push(`Syntax error: ${error}`);
  }

  return errors;
};

export const compileToPointy = (pipeline: Pipeline): string => {
  const { nodes, edges } = pipeline;
  let pointyCode = '';

  // First, compile all events
  nodes.forEach((node: PipelineNode) => {
    pointyCode += `${node.data.event.name} {\n${node.data.event.code}\n}\n\n`;
  });

  // Then add all connections
  edges.forEach((edge: PipelineEdge) => {
    const sourceNode = nodes.find(n => n.id === edge.source);
    const targetNode = nodes.find(n => n.id === edge.target);
    
    if (sourceNode && targetNode) {
      pointyCode += `${sourceNode.data.event.name} -> ${targetNode.data.event.name}\n`;
    }
  });

  return pointyCode;
};

export const parsePointyCode = (code: string): Partial<Pipeline> => {
  const nodes: PipelineNode[] = [];
  const edges: PipelineEdge[] = [];
  const eventMap = new Map<string, string>();

  const lines = code.split('\n');
  let currentEvent: { name: string; code: string } | null = null;
  let currentCode = '';

  lines.forEach((line) => {
    const trimmedLine = line.trim();
    
    if (!trimmedLine || trimmedLine.startsWith('//')) {
      return;
    }

    // Check for event declaration
    const eventMatch = trimmedLine.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*{/);
    if (eventMatch) {
      if (currentEvent) {
        eventMap.set(currentEvent.name, currentCode.trim());
      }
      currentEvent = { name: eventMatch[1], code: '' };
      currentCode = '';
      return;
    }

    // Check for event end
    if (trimmedLine === '}' && currentEvent) {
      eventMap.set(currentEvent.name, currentCode.trim());
      currentEvent = null;
      currentCode = '';
      return;
    }

    // Check for connection
    const connectionMatch = trimmedLine.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*->\s*([a-zA-Z_][a-zA-Z0-9_]*)$/);
    if (connectionMatch) {
      const [, source, target] = connectionMatch;
      edges.push({
        id: `${source}-${target}`,
        source: `event-${source}`,
        target: `event-${target}`,
      });
      return;
    }

    // Add code line to current event
    if (currentEvent) {
      currentCode += line + '\n';
    }
  });

  // Create nodes from events
  let x = 100;
  let y = 100;
  eventMap.forEach((code, name) => {
    nodes.push({
      id: `event-${name}`,
      type: 'event',
      position: { x, y },
      data: {
        event: {
          id: `event-${name}`,
          name,
          code,
        },
      },
    });
    x += 200;
    if (x > 700) {
      x = 100;
      y += 150;
    }
  });

  return { nodes, edges };
};