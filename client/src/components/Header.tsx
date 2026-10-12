import React from 'react';
import { Shield, Database, Radio } from 'lucide-react';
import type { HealthResponse } from '../api/spec.api.js';

interface HeaderProps {
  health: HealthResponse | null;
  healthError: string | null;
}

export const Header: React.FC<HeaderProps> = ({ health, healthError }) => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-lg text-slate-100 tracking-tight">API Sentinel</h1>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Phase 1 MVP
              </span>
            </div>
            <p className="text-xs text-slate-400">Automated API Testing & Regression Analysis</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          {health ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-800/80 border border-slate-700">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-slate-300 font-medium">Server Connected</span>
              <span className="text-slate-500">•</span>
              <div className="flex items-center gap-1.5 text-slate-300">
                <Database className="h-3.5 w-3.5 text-slate-400" />
                <span>
                  Storage:{' '}
                  <span className={health.storage?.isDemo ? 'text-amber-400 font-semibold' : 'text-emerald-400 font-semibold'}>
                    {health.storage?.mode.toUpperCase() ?? 'UNKNOWN'}
                  </span>
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-rose-950/40 border border-rose-800/60 text-rose-300">
              <Radio className="h-3.5 w-3.5 animate-pulse text-rose-400" />
              <span>{healthError ? 'Backend Disconnected' : 'Checking status...'}</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
