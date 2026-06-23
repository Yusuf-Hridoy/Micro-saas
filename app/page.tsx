'use client';

import { useState, useMemo } from 'react';
import {
  calculateJobCost,
  type JobConfiguration,
  type WoodDensity,
  type AccessLevel,
  type Hazard,
  type HealthIssue,
} from '@/utils/pricingEngine';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: JobConfiguration = {
  treeSize: 24,
  woodDensity: 'softwood',
  hazards: [],
  treeHealth: [],
  accessLevel: 'easy',
};

const DENSITY_OPTIONS: { value: WoodDensity; label: string }[] = [
  { value: 'softwood', label: 'Softwood' },
  { value: 'hardwood', label: 'Hardwood' },
  { value: 'brittle', label: 'Brittle' },
];

const HAZARD_OPTIONS: { value: Hazard; label: string }[] = [
  { value: 'powerlines', label: 'Powerlines' },
  { value: 'house', label: 'House' },
  { value: 'fences', label: 'Fences' },
];

const HEALTH_OPTIONS: { value: HealthIssue; label: string }[] = [
  { value: 'decay', label: 'Decay' },
  { value: 'lean', label: 'Lean' },
  { value: 'deadwood', label: 'Deadwood' },
];

const ACCESS_OPTIONS: { value: AccessLevel; label: string }[] = [
  { value: 'easy', label: 'Easy Bucket Access' },
  { value: 'climbing_only', label: 'Tight Climbing Only' },
];

// ---------------------------------------------------------------------------
// UI components
// ---------------------------------------------------------------------------

export default function PriceDefenserPage(): JSX.Element {
  const [config, setConfig] = useState<JobConfiguration>(DEFAULT_CONFIG);
  const [aiJustifications, setAiJustifications] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const estimate = useMemo(() => calculateJobCost(config), [config]);

  const setTreeSize = (treeSize: number) => {
    setConfig((prev) => ({ ...prev, treeSize }));
  };

  const setWoodDensity = (woodDensity: WoodDensity) => {
    setConfig((prev) => ({ ...prev, woodDensity }));
  };

  const toggleHazard = (hazard: Hazard) => {
    setConfig((prev) => {
      const hazards = prev.hazards.includes(hazard)
        ? prev.hazards.filter((h) => h !== hazard)
        : [...prev.hazards, hazard];
      return { ...prev, hazards };
    });
  };

  const toggleHealthIssue = (issue: HealthIssue) => {
    setConfig((prev) => {
      const treeHealth = prev.treeHealth.includes(issue)
        ? prev.treeHealth.filter((i) => i !== issue)
        : [...prev.treeHealth, issue];
      return { ...prev, treeHealth };
    });
  };

  const setAccessLevel = (accessLevel: AccessLevel) => {
    setConfig((prev) => ({ ...prev, accessLevel }));
  };

  const resetForm = () => {
    setConfig(DEFAULT_CONFIG);
    setAiJustifications('');
    setError('');
    setIsLoading(false);
  };

  const handleCalculateRiskAndPrice = async () => {
    // 1. Run the local mathematical calculation.
    const localEstimate = calculateJobCost(config);

    // 2. Start loading state.
    setIsLoading(true);
    setError('');
    setAiJustifications('');

    try {
      // 3. Call the serverless Gemini API route.
      const response = await fetch('/api/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...config,
          minPrice: localEstimate.minPrice,
          maxPrice: localEstimate.maxPrice,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch AI justifications.');
      }

      // 4. Store the AI justifications.
      setAiJustifications(data.justifications);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-neutral-950">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between bg-neutral-900 px-4 py-4 shadow-lg">
        <h1 className="text-xl font-bold tracking-tight text-white">
          🌳 Price Defenser Pro
        </h1>
        <button
          type="button"
          onClick={resetForm}
          className="rounded-lg bg-neutral-700 px-4 py-3 text-base font-semibold text-white active:bg-neutral-600"
        >
          Reset Form
        </button>
      </header>

      {/* Main form */}
      <main className="flex-1 overflow-y-auto overscroll-contain px-4 pb-72 pt-5">
        {/* Step 1: Size & Mass */}
        <section className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-4 text-lg font-bold text-white">Step 1: Size & Mass</h2>

          <div className="mb-6">
            <div className="mb-3 flex items-baseline justify-between">
              <label htmlFor="tree-size" className="text-base font-semibold text-neutral-200">
                Tree Diameter
              </label>
              <span className="text-3xl font-extrabold text-green-400">
                {config.treeSize}″
              </span>
            </div>
            <input
              id="tree-size"
              type="range"
              min={12}
              max={50}
              step={1}
              value={config.treeSize}
              onChange={(e) => setTreeSize(Number(e.target.value))}
              className="w-full"
              aria-label="Tree diameter in inches"
            />
            <div className="mt-2 flex justify-between text-base font-medium text-neutral-400">
              <span>12″</span>
              <span>50″</span>
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-base font-semibold text-neutral-200">Wood Density</h3>
            <div className="grid grid-cols-3 gap-3">
              {DENSITY_OPTIONS.map((option) => {
                const active = config.woodDensity === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setWoodDensity(option.value)}
                    className={[
                      'rounded-xl px-3 py-4 text-base font-bold transition-colors',
                      active
                        ? 'bg-green-600 text-white shadow-md'
                        : 'bg-neutral-800 text-neutral-300 active:bg-neutral-700',
                    ].join(' ')}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Step 2: Surrounding Hazards */}
        <section className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-4 text-lg font-bold text-white">Step 2: Surrounding Hazards</h2>
          <div className="grid grid-cols-1 gap-3">
            {HAZARD_OPTIONS.map((option) => {
              const active = config.hazards.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleHazard(option.value)}
                  className={[
                    'flex items-center justify-between rounded-xl px-5 py-5 text-left text-lg font-bold transition-colors',
                    active
                      ? 'bg-orange-600 text-white shadow-md'
                      : 'bg-neutral-800 text-neutral-300 active:bg-neutral-700',
                  ].join(' ')}
                >
                  <span>{option.label}</span>
                  <span
                    className={[
                      'flex h-8 w-8 items-center justify-center rounded-full border-2 text-base',
                      active
                        ? 'border-white bg-white text-orange-600'
                        : 'border-neutral-500 text-transparent',
                    ].join(' ')}
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Step 3: Tree Structural Health */}
        <section className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-4 text-lg font-bold text-white">Step 3: Tree Structural Health</h2>
          <div className="grid grid-cols-1 gap-3">
            {HEALTH_OPTIONS.map((option) => {
              const active = config.treeHealth.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleHealthIssue(option.value)}
                  className={[
                    'flex items-center justify-between rounded-xl px-5 py-5 text-left text-lg font-bold transition-colors',
                    active
                      ? 'bg-amber-600 text-white shadow-md'
                      : 'bg-neutral-800 text-neutral-300 active:bg-neutral-700',
                  ].join(' ')}
                >
                  <span>{option.label}</span>
                  <span
                    className={[
                      'flex h-8 w-8 items-center justify-center rounded-full border-2 text-base',
                      active
                        ? 'border-white bg-white text-amber-600'
                        : 'border-neutral-500 text-transparent',
                    ].join(' ')}
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Step 4: Access Rigging */}
        <section className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-4 text-lg font-bold text-white">Step 4: Access Rigging</h2>
          <div className="grid grid-cols-2 gap-3">
            {ACCESS_OPTIONS.map((option) => {
              const active = config.accessLevel === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setAccessLevel(option.value)}
                  className={[
                    'rounded-xl px-3 py-5 text-base font-bold transition-colors',
                    active
                      ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-neutral-800 text-neutral-300 active:bg-neutral-700',
                  ].join(' ')}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </section>
      </main>

      {/* Dynamic Results Widget */}
      <div className="fixed inset-x-0 bottom-0 border-t border-neutral-800 bg-neutral-900 p-4 shadow-2xl">
        <div className="rounded-2xl bg-neutral-800 p-5">
          <div className="mb-3 flex items-center justify-between">
            <span
              className={[
                'rounded-full px-4 py-2 text-base font-bold',
                estimate.riskProfile === 'CRITICAL' && 'bg-red-600 text-white',
                estimate.riskProfile === 'HIGH' && 'bg-orange-500 text-white',
                estimate.riskProfile === 'STANDARD' && 'bg-green-600 text-white',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {estimate.riskProfile === 'CRITICAL' && '🔴 CRITICAL RISK PROFILE'}
              {estimate.riskProfile === 'HIGH' && '🟠 HIGH RISK'}
              {estimate.riskProfile === 'STANDARD' && '🟢 STANDARD RISK'}
            </span>
          </div>

          <p className="mb-1 text-base font-semibold text-neutral-300">
            Defensible Price Range:
          </p>
          <p className="mb-5 break-words text-4xl font-black text-white sm:text-5xl">
            {`$${estimate.minPrice.toLocaleString('en-US')}`} – {`$${estimate.maxPrice.toLocaleString('en-US')}`}
          </p>

          {isLoading ? (
            <div className="flex items-center gap-3 rounded-xl bg-neutral-700 px-5 py-4">
              <span className="inline-block h-6 w-6 animate-pulse rounded-full bg-blue-400" />
              <span className="text-base font-semibold text-white">
                AI Analyzing Risk Factors…
              </span>
            </div>
          ) : error ? (
            <div className="rounded-xl bg-red-900/40 px-5 py-4 text-base font-semibold text-red-200">
              {error}
            </div>
          ) : aiJustifications ? (
            <div className="rounded-xl bg-neutral-700 px-5 py-4">
              <h3 className="mb-3 text-base font-bold text-white">AI Risk Justifications</h3>
              <div className="space-y-3 text-base leading-relaxed text-neutral-100">
                {aiJustifications
                  .split('\n')
                  .filter((line) => line.trim().length > 0)
                  .map((line, index) => (
                    <p key={index} className="pl-2">
                      {line.startsWith('•') ? line : `• ${line}`}
                    </p>
                  ))}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleCalculateRiskAndPrice}
              className="w-full rounded-xl bg-blue-600 px-5 py-4 text-lg font-bold text-white shadow-md active:bg-blue-500"
            >
              Calculate Risk & Price
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
