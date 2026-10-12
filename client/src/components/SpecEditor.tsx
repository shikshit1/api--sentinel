import React, { useRef } from 'react';
import { FileUp, Play, Trash2, BookOpen, Layers } from 'lucide-react';
import { SAMPLE_TASK_API_YAML, SAMPLE_PETSTORE_JSON } from '../samples/sample-specs.js';

interface SpecEditorProps {
  content: string;
  onChange: (value: string) => void;
  onParse: () => void;
  isLoading: boolean;
}

export const SpecEditor: React.FC<SpecEditorProps> = ({
  content,
  onChange,
  onParse,
  isLoading,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        onChange(text);
      }
    };
    reader.readAsText(file);
    // Reset file input so user can re-upload same file if desired
    e.target.value = '';
  };

  const lineCount = content ? content.split('\n').length : 0;
  const byteCount = new Blob([content]).size;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl flex flex-col">
      {/* Top action toolbar */}
      <div className="p-3 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-300 uppercase tracking-wider text-[11px] px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
            OpenAPI Spec Input
          </span>
          <span className="text-slate-500">
            {lineCount} lines • {(byteCount / 1024).toFixed(1)} KB
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Preset Buttons */}
          <button
            type="button"
            onClick={() => onChange(SAMPLE_TASK_API_YAML)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700"
            title="Load Task API sample in YAML format"
          >
            <BookOpen className="h-3.5 w-3.5 text-indigo-400" />
            <span>Task API (YAML)</span>
          </button>

          <button
            type="button"
            onClick={() => onChange(SAMPLE_PETSTORE_JSON)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700"
            title="Load Petstore sample in JSON format"
          >
            <Layers className="h-3.5 w-3.5 text-emerald-400" />
            <span>Petstore (JSON)</span>
          </button>

          {/* Upload File */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.yaml,.yml"
            className="hidden"
            onChange={handleFileUpload}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700"
          >
            <FileUp className="h-3.5 w-3.5 text-sky-400" />
            <span>Upload File</span>
          </button>

          {/* Clear */}
          {content && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 transition-colors border border-slate-700"
              title="Clear editor"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Editor area */}
      <div className="relative">
        <textarea
          value={content}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Paste an OpenAPI 3.0 / 3.1 specification in JSON or YAML format here, or click "Task API (YAML)" above...`}
          rows={16}
          className="w-full bg-slate-950 p-4 font-mono text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y border-0 leading-relaxed selection:bg-indigo-900"
          spellCheck={false}
        />
      </div>

      {/* Bottom Submit bar */}
      <div className="p-3 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Supports OpenAPI 3.0.x & 3.1.x specifications. Validates and dereferences all <code className="text-slate-400">$ref</code> components.
        </p>
        <button
          type="button"
          disabled={!content.trim() || isLoading}
          onClick={onParse}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-lg font-medium text-xs bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-indigo-600/20"
        >
          {isLoading ? (
            <>
              <div className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Parsing & Dereferencing...</span>
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>Parse & Normalize Spec</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
