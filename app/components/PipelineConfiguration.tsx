'use client';

import { useState, useCallback } from 'react';
import { PipelineConfig, PipelineField, DataType } from '../types/pipeline';

interface PipelineConfigurationProps {
  onSave: (config: PipelineConfig) => void;
  onCancel: () => void;
  initialConfig?: PipelineConfig;
}

const defaultField: PipelineField = {
  name: '',
  required: false,
  data_type: 'string',
  batch_processor: false,
  batch_size: 1,
};

const dataTypes: DataType[] = ['string', 'number', 'boolean', 'object', 'array'];

export const PipelineConfiguration = ({
  onSave,
  onCancel,
  initialConfig,
}: PipelineConfigurationProps) => {
  const [name, setName] = useState(initialConfig?.name || '');
  const [fields, setFields] = useState<PipelineField[]>(
    initialConfig?.fields || [{ ...defaultField }]
  );

  const addField = useCallback(() => {
    setFields((prev) => [...prev, { ...defaultField }]);
  }, []);

  const removeField = useCallback((index: number) => {
    setFields((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateField = useCallback((index: number, field: Partial<PipelineField>) => {
    setFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...field } : f))
    );
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name,
      fields: fields.filter((f) => f.name.trim() !== ''),
    });
  }, [name, fields, onSave]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-auto">
        <form onSubmit={handleSubmit} className="p-6">
          <h2 className="text-2xl font-bold mb-6">Pipeline Configuration</h2>
          
          <div className="mb-6">
            <label className="block mb-2">
              Pipeline Name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border rounded px-3 py-2 mt-1"
                required
              />
            </label>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-semibold mb-4">Fields</h3>
            {fields.map((field, index) => (
              <div key={index} className="mb-4 p-4 border rounded">
                <div className="grid grid-cols-2 gap-4">
                  <label className="block">
                    Field Name
                    <input
                      type="text"
                      value={field.name}
                      onChange={(e) =>
                        updateField(index, { name: e.target.value })
                      }
                      className="w-full border rounded px-3 py-2 mt-1"
                    />
                  </label>

                  <label className="block">
                    Data Type
                    <select
                      value={field.data_type}
                      onChange={(e) =>
                        updateField(index, {
                          data_type: e.target.value as DataType,
                        })
                      }
                      className="w-full border rounded px-3 py-2 mt-1"
                    >
                      {dataTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    Default Value
                    <input
                      type="text"
                      value={field.default == null ? '' : String(field.default)}
                      onChange={(e) =>
                        updateField(index, { default: e.target.value })
                      }
                      className="w-full border rounded px-3 py-2 mt-1"
                    />
                  </label>

                  <div className="flex items-center space-x-4 mt-6">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) =>
                          updateField(index, { required: e.target.checked })
                        }
                        className="mr-2"
                      />
                      Required
                    </label>

                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={field.batch_processor}
                        onChange={(e) =>
                          updateField(index, {
                            batch_processor: e.target.checked,
                          })
                        }
                        className="mr-2"
                      />
                      Batch Processor
                    </label>

                    {field.batch_processor && (
                      <label className="flex items-center">
                        Batch Size
                        <input
                          type="number"
                          value={field.batch_size || 1}
                          onChange={(e) =>
                            updateField(index, {
                              batch_size: parseInt(e.target.value),
                            })
                          }
                          min="1"
                          className="w-20 border rounded px-3 py-2 ml-2"
                        />
                      </label>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => removeField(index)}
                  className="mt-2 text-red-600 hover:text-red-800"
                >
                  Remove Field
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={addField}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Add Field
            </button>
          </div>

          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border rounded hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
            >
              Save Pipeline
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PipelineConfiguration;