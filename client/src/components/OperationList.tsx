import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Search, FileText, Send, CheckCircle } from 'lucide-react';
import type { NormalizedOperation } from '@api-sentinel/shared';

interface OperationListProps {
  operations: NormalizedOperation[];
}

export const OperationList: React.FC<OperationListProps> = ({ operations }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMethod, setSelectedMethod] = useState<string>('all');
  const [expandedOpId, setExpandedOpId] = useState<string | null>(null);

  const filteredOperations = operations.filter((op) => {
    const matchesSearch =
      op.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
      op.summary?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      op.operationId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesMethod = selectedMethod === 'all' || op.method === selectedMethod;
    return matchesSearch && matchesMethod;
  });

  const getMethodBadgeClass = (method: string) => {
    switch (method.toLowerCase()) {
      case 'get':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'post':
        return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30';
      case 'put':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'delete':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      case 'patch':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const getStatusBadgeClass = (status: string) => {
    if (status.startsWith('2')) {
      return 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60';
    }
    if (status.startsWith('4')) {
      return 'bg-amber-950/60 text-amber-400 border-amber-800/60';
    }
    if (status.startsWith('5')) {
      return 'bg-rose-950/60 text-rose-400 border-rose-800/60';
    }
    return 'bg-slate-800 text-slate-400 border-slate-700';
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
      {/* Controls Header */}
      <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-900/90">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-slate-200 text-sm">
            Extracted API Operations ({filteredOperations.length} of {operations.length})
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Method Filter */}
          <div className="flex items-center rounded-lg bg-slate-950 p-0.5 border border-slate-800">
            {['all', 'get', 'post', 'put', 'delete', 'patch'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setSelectedMethod(m)}
                className={`px-2.5 py-1 rounded-md uppercase font-semibold text-[11px] transition-colors ${
                  selectedMethod === m
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter by path, summary..."
              className="bg-slate-950 pl-8 pr-3 py-1.5 rounded-lg border border-slate-800 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 w-48 sm:w-64"
            />
          </div>
        </div>
      </div>

      {/* Operations List */}
      {filteredOperations.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-xs">
          No operations matched your filter criteria.
        </div>
      ) : (
        <div className="divide-y divide-slate-800/80">
          {filteredOperations.map((op) => {
            const isExpanded = expandedOpId === op.operationId;

            return (
              <div key={op.operationId} className="hover:bg-slate-800/30 transition-colors">
                <div
                  className="p-3.5 flex flex-wrap items-center justify-between gap-3 cursor-pointer"
                  onClick={() => setExpandedOpId(isExpanded ? null : op.operationId)}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <button
                      type="button"
                      className="text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>

                    {/* Method Badge */}
                    <span
                      className={`px-2.5 py-0.5 rounded font-mono font-bold text-xs uppercase border ${getMethodBadgeClass(
                        op.method
                      )}`}
                    >
                      {op.method}
                    </span>

                    {/* Path */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-semibold text-slate-200">
                          {op.path}
                        </span>
                        {op.summary && (
                          <span className="text-xs text-slate-400 truncate max-w-md">
                            — {op.summary}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        id: {op.operationId}
                      </div>
                    </div>
                  </div>

                  {/* Badges column */}
                  <div className="flex items-center gap-2 text-xs flex-wrap">
                    {/* Parameters count */}
                    {op.parameters.length > 0 && (
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[11px]">
                        {op.parameters.length} param{op.parameters.length > 1 ? 's' : ''}
                      </span>
                    )}

                    {/* RequestBody flag */}
                    {op.requestBody && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-800/60 text-[11px]">
                        <Send className="h-3 w-3" />
                        body
                      </span>
                    )}

                    {/* Responses status codes */}
                    <div className="flex items-center gap-1">
                      {op.responses.map((res) => (
                        <span
                          key={res.statusCode}
                          className={`px-1.5 py-0.5 rounded font-mono text-[11px] border ${getStatusBadgeClass(
                            res.statusCode
                          )}`}
                          title={res.description}
                        >
                          {res.statusCode}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Expanded Inspection Drawer */}
                {isExpanded && (
                  <div className="px-10 py-4 bg-slate-950/60 border-t border-slate-800/80 space-y-3 text-xs">
                    {op.description && (
                      <div>
                        <div className="text-slate-400 font-semibold mb-1">Description</div>
                        <p className="text-slate-300 leading-relaxed">{op.description}</p>
                      </div>
                    )}

                    {/* Parameters detail */}
                    {op.parameters.length > 0 && (
                      <div>
                        <div className="text-slate-400 font-semibold mb-1.5 flex items-center gap-1">
                          <FileText className="h-3.5 w-3.5 text-slate-500" />
                          Parameters ({op.parameters.length})
                        </div>
                        <div className="rounded-lg border border-slate-800 overflow-hidden">
                          <table className="w-full text-left">
                            <thead className="bg-slate-900 text-slate-400 text-[11px]">
                              <tr>
                                <th className="p-2">Name</th>
                                <th className="p-2">Location</th>
                                <th className="p-2">Required</th>
                                <th className="p-2">Type / Schema</th>
                                <th className="p-2">Description</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-850 font-mono text-[11px]">
                              {op.parameters.map((p, idx) => (
                                <tr key={idx} className="bg-slate-950/40">
                                  <td className="p-2 font-semibold text-slate-200">{p.name}</td>
                                  <td className="p-2 text-indigo-400">{p.in}</td>
                                  <td className="p-2">
                                    {p.required ? (
                                      <span className="text-rose-400 font-bold">Yes</span>
                                    ) : (
                                      <span className="text-slate-500">No</span>
                                    )}
                                  </td>
                                  <td className="p-2 text-slate-300">
                                    {p.schema ? JSON.stringify(p.schema) : '—'}
                                  </td>
                                  <td className="p-2 text-slate-400 font-sans">
                                    {p.description || '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Request Body detail */}
                    {op.requestBody && (
                      <div>
                        <div className="text-slate-400 font-semibold mb-1 flex items-center gap-1">
                          <Send className="h-3.5 w-3.5 text-indigo-400" />
                          Request Body ({op.requestBody.contentType})
                          {op.requestBody.required && (
                            <span className="text-rose-400 font-normal ml-1">• Required</span>
                          )}
                        </div>
                        {op.requestBody.schema && (
                          <pre className="p-3 rounded-lg bg-slate-900 border border-slate-800 font-mono text-[11px] text-slate-300 overflow-x-auto max-h-48">
                            {JSON.stringify(op.requestBody.schema, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}

                    {/* Responses detail */}
                    <div>
                      <div className="text-slate-400 font-semibold mb-1 flex items-center gap-1">
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                        Documented Response Contracts ({op.responses.length})
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {op.responses.map((res) => (
                          <div
                            key={res.statusCode}
                            className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span
                                className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] border ${getStatusBadgeClass(
                                  res.statusCode
                                )}`}
                              >
                                Status {res.statusCode}
                              </span>
                              {res.contentType && (
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {res.contentType}
                                </span>
                              )}
                            </div>
                            <p className="text-slate-300 text-[11px] mb-1.5">
                              {res.description || 'No description provided'}
                            </p>
                            {res.schema && (
                              <details className="text-[10px] text-slate-400">
                                <summary className="cursor-pointer hover:text-slate-200">
                                  View Response Schema
                                </summary>
                                <pre className="mt-1 p-2 rounded bg-slate-950 font-mono text-[10px] text-slate-300 overflow-x-auto max-h-32">
                                  {JSON.stringify(res.schema, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
