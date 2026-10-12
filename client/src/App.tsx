import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Header } from './components/Header.js';
import { SpecEditor } from './components/SpecEditor.js';
import { SpecOverview } from './components/SpecOverview.js';
import { OperationList } from './components/OperationList.js';
import { fetchHealth, parseSpecification, type HealthResponse } from './api/spec.api.js';
import { SAMPLE_TASK_API_YAML } from './samples/sample-specs.js';
import type { ParsedSpecSummary } from '@api-sentinel/shared';

export const App: React.FC = () => {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [specContent, setSpecContent] = useState<string>(SAMPLE_TASK_API_YAML);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [parsedSummary, setParsedSummary] = useState<ParsedSpecSummary | null>(null);
  const [error, setError] = useState<{ code?: string; message: string; details?: unknown } | null>(null);

  // Probe server health on load
  useEffect(() => {
    let isMounted = true;
    fetchHealth()
      .then((data) => {
        if (isMounted) {
          setHealth(data);
          setHealthError(null);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setHealthError(err.message);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleParse = async () => {
    if (!specContent.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const summary = await parseSpecification(specContent);
      setParsedSummary(summary);
    } catch (err: any) {
      setError({
        code: err.code || 'PARSE_FAILED',
        message: err.message || 'Failed to parse OpenAPI specification.',
        details: err.details,
      });
      setParsedSummary(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col text-slate-100">
      <Header health={health} healthError={healthError} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Subheader / Milestone Info Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-900/50 border border-slate-800">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">
              Week 1 Vertical Slice: Deterministic OpenAPI Ingestion & Inspection
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Paste or upload an OpenAPI 3.0/3.1 JSON or YAML specification to normalize endpoints, parameters, request bodies, and response schemas.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-md bg-emerald-950/40 border border-emerald-800/40 text-emerald-400 font-medium flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Contract Normalization Active
            </span>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/80 text-rose-200 space-y-1 shadow-lg">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
              <span>Specification Error: {error.code}</span>
            </div>
            <p className="text-xs text-rose-300 pl-6 leading-relaxed">{error.message}</p>
            {Boolean(error.details) && (
              <pre className="mt-2 ml-6 p-2 rounded bg-slate-950/80 border border-rose-900/50 text-[11px] font-mono text-rose-200 overflow-x-auto max-h-36">
                {typeof error.details === 'string'
                  ? error.details
                  : JSON.stringify(error.details, null, 2)}
              </pre>
            )}
          </div>
        )}

        {/* Spec Editor (Upload / Paste / Samples) */}
        <SpecEditor
          content={specContent}
          onChange={setSpecContent}
          onParse={handleParse}
          isLoading={isLoading}
        />

        {/* Parsed Output Section */}
        {parsedSummary && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <SpecOverview summary={parsedSummary} />
            <OperationList operations={parsedSummary.operations} />
          </div>
        )}
      </main>

      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-600">
        API Sentinel • Automated API Testing and Regression Analysis Platform
      </footer>
    </div>
  );
};
