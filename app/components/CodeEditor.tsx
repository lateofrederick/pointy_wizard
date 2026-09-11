'use client';

import { Editor } from '@monaco-editor/react';
import { PipelineEvent, PipelineConfig } from '../types/pipeline';

interface CodeEditorProps {
  event: PipelineEvent | null;
  config: PipelineConfig;
  onCodeChange: (code: string) => void;
}

const CodeEditor = ({ event, config, onCodeChange }: CodeEditorProps) => {
  if (!event) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        Select an event to edit its code
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-2 border-b">
        <h3 className="font-bold">Editing: {event.name}</h3>
      </div>
      <div className="border-b">
        <div className="p-2">
          <h4 className="text-sm font-semibold mb-2">Pipeline Fields</h4>
          <div className="text-xs space-y-1">
            {config.fields.map((field) => (
              <div key={field.name} className="flex items-start">
                <code className="bg-gray-100 px-1 py-0.5 rounded">
                  {`data['${field.name}']`}
                </code>
                <span className="ml-2 text-gray-600">
                  ({field.data_type}
                  {field.required ? ', required' : ''}
                  {field.batch_processor ? `, batch[${field.batch_size}]` : ''})
                </span>
              </div>
            ))}
            {config.fields.length === 0 && (
              <div className="text-gray-500">No fields configured</div>
            )}
          </div>
        </div>
        <div className="p-2 bg-gray-50 text-xs text-gray-600">
          {`Access pipeline fields using the data dictionary, e.g., data['field_name']`}
        </div>
      </div>
      <div className="flex-1">
        <Editor
          height="100%"
          defaultLanguage="python"
          defaultValue="# Write your Python code here"
          value={event.code || '# Write your Python code here'}
          onChange={(value) => onCodeChange(value || '')}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            tabSize: 4,
            insertSpaces: true,
            autoIndent: 'full',
            formatOnPaste: true,
            formatOnType: true,
            autoClosingBrackets: 'always',
            autoClosingQuotes: 'always',
            suggest: {
              snippetsPreventQuickSuggestions: false,
            },
            quickSuggestions: {
              other: true,
              comments: true,
              strings: true
            },
            folding: true,
            renderWhitespace: 'selection',
            rulers: [80, 100],
            wordWrap: 'on',
            bracketPairColorization: {
              enabled: true
            }
          }}
        />
      </div>
    </div>
  );
};

export default CodeEditor;