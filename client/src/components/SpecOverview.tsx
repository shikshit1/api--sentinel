import React from 'react';
import { Server, FileCode, CheckCircle2, ListTree } from 'lucide-react';
import type { ParsedSpecSummary } from '@api-sentinel/shared';

interface SpecOverviewProps {
  summary: ParsedSpecSummary;
}

export const SpecOverview: React.FC<SpecOverviewProps> = ({ summary }) => {
  const methodCounts = summary.operations.reduce<Record<string, number>>((acc, op) => {
    acc[op.method] = (acc[op.method] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-100">{summary.title}</h2>
            <span className="text-xs px-2 py-0.5 rounded font-mono bg-slate-800 text-slate-300 border border-slate-700">
              v{summary.version}
            </span>
          </div>
          {summary.description && (
            <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
              {summary.description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Valid OpenAPI {summary.openapiVersion}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 flex items-center gap-3">
          <div className="p-2 rounded bg-indigo-500/10 text-indigo-400">
            <ListTree className="h-4 w-4" />
          </div>
          <div>
            <div className="text-slate-400">Operations Extracted</div>
            <div className="text-base font-bold text-slate-100">{summary.operationCount}</div>
          </div>
        </div>

        <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 flex items-center gap-3 sm:col-span-1 lg:col-span-3">
          <div className="p-2 rounded bg-sky-500/10 text-sky-400">
            <Server className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-slate-400">Target Server Endpoints</div>
            <div className="flex flex-wrap gap-1.5 mt-0.5">
              {summary.servers.length > 0 ? (
                summary.servers.map((srv, idx) => (
                  <span
                    key={idx}
                    className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 truncate max-w-full"
                  >
                    {srv}
                  </span>
                ))
              ) : (
                <span className="text-slate-500 italic">None specified in spec</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Methods breakdown badges */}
      <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
        <span className="text-slate-400 font-medium mr-1 flex items-center gap-1">
          <FileCode className="h-3.5 w-3.5 text-slate-500" />
          Methods:
        </span>
        {Object.entries(methodCounts).map(([method, count]) => {
          const colors: Record<string, string> = {
            get: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
            post: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
            put: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
            delete: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
            patch: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
          };
          const badgeClass = colors[method] || 'bg-slate-800 text-slate-300 border-slate-700';

          return (
            <span
              key={method}
              className={`px-2 py-0.5 rounded font-mono font-semibold uppercase text-[11px] border ${badgeClass}`}
            >
              {method} <span className="opacity-70">({count})</span>
            </span>
          );
        })}
      </div>
    </div>
  );
};
