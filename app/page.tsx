'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import {
  calculatePrice,
  MIN_TREE_SIZE,
  MAX_TREE_SIZE,
  MIN_TREE_HEIGHT,
  MAX_TREE_HEIGHT,
  TREE_HEIGHT_STEP,
  type JobConfiguration,
  type PriceEstimate,
  type WoodDensity,
  type AccessLevel,
  type Hazard,
  type HealthIssue,
  type AddOn,
} from '@/utils/pricingEngine';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: JobConfiguration = {
  treeSize: 24,
  treeHeight: 30,
  woodDensity: 'softwood',
  hazards: [],
  treeHealth: [],
  accessLevel: 'easy',
  addOns: [],
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

const ADD_ON_OPTIONS: { value: AddOn; label: string }[] = [
  { value: 'stump_grinding', label: 'Stump grinding' },
  { value: 'debris_haulaway', label: 'Debris haul-away' },
];

// ---------------------------------------------------------------------------
// UI components
// ---------------------------------------------------------------------------

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-US')}`;
}

function BreakdownRow({
  label,
  amount,
  bold = false,
}: {
  label: string;
  amount: number;
  bold?: boolean;
}): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span
        className={[
          'shrink-0 text-neutral-200',
          bold ? 'text-base font-bold' : 'font-medium',
        ].join(' ')}
      >
        {label}
      </span>
      <span className="w-full border-b border-dotted border-neutral-700" aria-hidden="true" />
      <span
        className={[
          'shrink-0 text-right tabular-nums text-neutral-100',
          bold ? 'text-base font-bold' : 'font-semibold',
        ].join(' ')}
      >
        {amount >= 0 ? '+' : ''}
        {formatCurrency(amount)}
      </span>
    </div>
  );
}

function BreakdownSection({
  title,
  items,
  subtotal,
}: {
  title: string;
  items: PriceEstimate['lineItems'];
  subtotal: number;
}): JSX.Element {
  return (
    <div>
      <p className="mb-1 text-xs font-bold uppercase tracking-wider text-neutral-500">{title}</p>
      <div className="space-y-0.5">
        {items.map((item) => (
          <BreakdownRow key={item.label} label={item.label} amount={item.amount} />
        ))}
        <BreakdownRow label={`${title} subtotal`} amount={subtotal} bold />
      </div>
    </div>
  );
}

function RiskBadge({
  level,
  color,
}: {
  level: PriceEstimate['riskLevel'];
  color: PriceEstimate['riskColor'];
}): JSX.Element {
  const colorClasses = {
    green: 'bg-green-600 text-white',
    amber: 'bg-amber-500 text-white',
    red: 'bg-red-600 text-white',
  };

  const labels = {
    STANDARD: '🟢 STANDARD RISK',
    ELEVATED: '🟠 ELEVATED RISK',
    HIGH: '🔴 HIGH RISK',
  };

  return (
    <span
      className={[
        'inline-block rounded-full px-4 py-2 text-sm font-bold',
        colorClasses[color],
      ].join(' ')}
    >
      {labels[level]}
    </span>
  );
}

function SwitchIndicator({ active }: { active: boolean }): JSX.Element {
  return (
    <span
      className={[
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200',
        active ? 'bg-green-600' : 'bg-neutral-600',
      ].join(' ')}
      aria-hidden="true"
    >
      <span
        className={[
          'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200',
          active ? 'translate-x-6' : 'translate-x-1',
        ].join(' ')}
      />
    </span>
  );
}

export default function PriceDefenderPage(): JSX.Element {
  const [config, setConfig] = useState<JobConfiguration>(DEFAULT_CONFIG);
  const [aiJustifications, setAiJustifications] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [summaryBarHeight, setSummaryBarHeight] = useState<number>(0);
  const [isResultVisible, setIsResultVisible] = useState<boolean>(false);

  const estimate = useMemo<PriceEstimate>(() => calculatePrice(config), [config]);
  const summaryBarRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLElement>(null);

  // Track slim summary bar height so the last input/footer never sits underneath it.
  useEffect(() => {
    const bar = summaryBarRef.current;
    if (!bar) return;

    const updateHeight = () => setSummaryBarHeight(bar.getBoundingClientRect().height);
    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(bar);
    window.addEventListener('resize', updateHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, []);

  // Hide the slim summary bar once the user scrolls to the full result section.
  useEffect(() => {
    const result = resultRef.current;
    if (!result) return;

    if (typeof IntersectionObserver === 'undefined') {
      setIsResultVisible(false);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsResultVisible(entry.isIntersecting),
      { threshold: 0.25 }
    );
    observer.observe(result);

    return () => observer.disconnect();
  }, []);

  const setTreeSize = (treeSize: number) => {
    setConfig((prev) => ({ ...prev, treeSize }));
  };

  const setTreeHeight = (treeHeight: number) => {
    setConfig((prev) => ({ ...prev, treeHeight }));
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

  const toggleAddOn = (addOn: AddOn) => {
    setConfig((prev) => {
      const addOns = prev.addOns.includes(addOn)
        ? prev.addOns.filter((a) => a !== addOn)
        : [...prev.addOns, addOn];
      return { ...prev, addOns };
    });
  };

  const resetForm = () => {
    setConfig(DEFAULT_CONFIG);
    setAiJustifications('');
    setError('');
    setIsLoading(false);
  };

  const scrollToResult = () => {
    resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  function parseJustifications(text: string): string[] {
    return text
      .split('\n')
      .map((line) => line.replace(/^[\s*•\-\d.]+/, '').trim())
      .filter((line) => line.length > 0);
  }

  const handleCalculateRiskAndPrice = async () => {
    // 1. Start loading state.
    setIsLoading(true);
    setError('');
    setAiJustifications('');

    try {
      // 2. Call the serverless Gemini API route with the current config.
      const response = await fetch('/api/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
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
    <div className="flex h-screen h-dvh flex-col overflow-hidden bg-neutral-950">
      {/* Header */}
      <header className="z-10 flex shrink-0 items-start justify-between gap-3 bg-neutral-900 px-4 py-4 shadow-lg">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-white">
              🌳 Price Defender Pro
            </h1>
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-300">
              Beta
            </span>
          </div>
          <p className="mt-0.5 text-sm leading-tight text-neutral-300">
            Price hazardous tree jobs with confidence — and show the customer exactly why.
          </p>
        </div>
        <button
          type="button"
          onClick={resetForm}
          className="rounded-lg bg-neutral-700 px-4 py-3 text-base font-semibold text-white active:bg-neutral-600"
        >
          Reset Form
        </button>
      </header>

      {/* Main form */}
      <main
        className="min-h-0 flex-1 overflow-y-auto scroll-smooth px-4 pt-5"
      >
        {/* 1. Size & Mass */}
        <section className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-4 text-lg font-bold text-white">1. Size & Mass</h2>

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
              min={MIN_TREE_SIZE}
              max={MAX_TREE_SIZE}
              step={1}
              value={config.treeSize}
              onChange={(e) => setTreeSize(Number(e.target.value))}
              className="w-full"
              aria-label="Tree diameter in inches"
            />
            <div className="mt-2 flex justify-between text-base font-medium text-neutral-400">
              <span>{MIN_TREE_SIZE}″</span>
              <span>{MAX_TREE_SIZE}″</span>
            </div>
          </div>

          <div className="mb-6">
            <div className="mb-3 flex items-baseline justify-between">
              <label htmlFor="tree-height" className="text-base font-semibold text-neutral-200">
                Tree Height
              </label>
              <span className="text-3xl font-extrabold text-green-400">{config.treeHeight}′</span>
            </div>
            <input
              id="tree-height"
              type="range"
              min={MIN_TREE_HEIGHT}
              max={MAX_TREE_HEIGHT}
              step={TREE_HEIGHT_STEP}
              value={config.treeHeight}
              onChange={(e) => setTreeHeight(Number(e.target.value))}
              className="w-full"
              aria-label="Tree height in feet"
            />
            <div className="mt-2 flex justify-between text-base font-medium text-neutral-400">
              <span>{MIN_TREE_HEIGHT}′</span>
              <span>{MAX_TREE_HEIGHT}′</span>
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

        {/* 2. Surrounding Hazards */}
        <section className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-4 text-lg font-bold text-white">2. Surrounding Hazards</h2>
          <div className="grid grid-cols-1 gap-3">
            {HAZARD_OPTIONS.map((option) => {
              const active = config.hazards.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleHazard(option.value)}
                  className={[
                    'flex items-center justify-between rounded-xl px-5 py-5 text-left text-lg font-bold transition-all',
                    active
                      ? 'bg-green-600 text-white shadow-md ring-2 ring-white/40'
                      : 'bg-neutral-800 text-neutral-300 active:bg-neutral-700',
                  ].join(' ')}
                >
                  <span>{option.label}</span>
                  <SwitchIndicator active={active} />
                </button>
              );
            })}
          </div>
        </section>

        {/* 3. Tree Structural Health */}
        <section className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-4 text-lg font-bold text-white">3. Tree Structural Health</h2>
          <div className="grid grid-cols-1 gap-3">
            {HEALTH_OPTIONS.map((option) => {
              const active = config.treeHealth.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleHealthIssue(option.value)}
                  className={[
                    'flex items-center justify-between rounded-xl px-5 py-5 text-left text-lg font-bold transition-all',
                    active
                      ? 'bg-green-600 text-white shadow-md ring-2 ring-white/40'
                      : 'bg-neutral-800 text-neutral-300 active:bg-neutral-700',
                  ].join(' ')}
                >
                  <span>{option.label}</span>
                  <SwitchIndicator active={active} />
                </button>
              );
            })}
          </div>
        </section>

        {/* 4. Access Rigging */}
        <section className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-4 text-lg font-bold text-white">4. Access Rigging</h2>
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
                      ? 'bg-green-600 text-white shadow-md'
                        : 'bg-neutral-800 text-neutral-300 active:bg-neutral-700',
                  ].join(' ')}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Add-on Services */}
        <section className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-4 text-lg font-bold text-white">Add-on Services</h2>
          <div className="grid grid-cols-1 gap-3">
            {ADD_ON_OPTIONS.map((option) => {
              const active = config.addOns.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleAddOn(option.value)}
                  className={[
                    'flex items-center justify-between rounded-xl px-5 py-5 text-left text-lg font-bold transition-all',
                    active
                      ? 'bg-green-600 text-white shadow-md ring-2 ring-white/40'
                      : 'bg-neutral-800 text-neutral-300 active:bg-neutral-700',
                  ].join(' ')}
                >
                  <span>{option.label}</span>
                  <SwitchIndicator active={active} />
                </button>
              );
            })}
          </div>
        </section>

        {/* Full Result Section — always rendered, reachable by scroll */}
        <section
          ref={resultRef}
          className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-xl"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                Defensible Range
              </p>
              <p className="break-words text-3xl font-black text-white sm:text-4xl">
                {`$${estimate.rangeLow.toLocaleString('en-US')}`} – {`$${estimate.rangeHigh.toLocaleString('en-US')}`}
              </p>
            </div>
            <RiskBadge level={estimate.riskLevel} color={estimate.riskColor} />
          </div>

          <div className="mb-5 space-y-1">
            <BreakdownSection
              title="Base labor"
              items={estimate.lineItems.filter((i) => i.type === 'base')}
              subtotal={estimate.baseSubtotal}
            />
            {estimate.hazardSubtotal > 0 && (
              <BreakdownSection
                title="Hazards"
                items={estimate.lineItems.filter((i) => i.type === 'hazard')}
                subtotal={estimate.hazardSubtotal}
              />
            )}
            {estimate.healthSubtotal > 0 && (
              <BreakdownSection
                title="Structural health"
                items={estimate.lineItems.filter((i) => i.type === 'health')}
                subtotal={estimate.healthSubtotal}
              />
            )}
            {estimate.accessSubtotal > 0 && (
              <BreakdownSection
                title="Access"
                items={estimate.lineItems.filter((i) => i.type === 'access')}
                subtotal={estimate.accessSubtotal}
              />
            )}
            {estimate.addOnSubtotal > 0 && (
              <BreakdownSection
                title="Add-ons"
                items={estimate.lineItems.filter((i) => i.type === 'addon')}
                subtotal={estimate.addOnSubtotal}
              />
            )}
          </div>

          <div className="mb-3 border-t border-neutral-700 pt-2">
            <BreakdownRow label="Total" amount={estimate.total} bold />
          </div>

          <p className="mb-5 text-base leading-snug text-neutral-200">
            {estimate.rationale}
          </p>

          {isLoading ? (
            <div className="flex items-center gap-3 rounded-xl bg-neutral-700 px-4 py-3">
              <span className="inline-block h-5 w-5 animate-pulse rounded-full bg-green-400" />
              <span className="text-sm font-semibold text-white">AI Analyzing Risk Factors…</span>
            </div>
          ) : error ? (
            <div className="rounded-xl bg-red-900/40 px-4 py-3 text-sm font-semibold text-red-200">
              {error}
            </div>
          ) : aiJustifications ? (
            <div className="rounded-xl bg-neutral-700 px-4 py-3">
              <h3 className="mb-2 text-sm font-bold text-white">AI Risk Justifications</h3>
              <ul className="list-disc space-y-2 pl-4 text-sm leading-relaxed text-neutral-100">
                {parseJustifications(aiJustifications).map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleCalculateRiskAndPrice}
              className="w-full rounded-xl bg-blue-600 px-4 py-3 text-base font-bold text-white shadow-md active:bg-blue-500"
            >
              Get AI Justifications
            </button>
          )}
        </section>

        {/* Footer disclaimer */}
        <footer className="pb-2 text-center">
          <p className="text-sm leading-snug text-neutral-500">
            Estimates use assumed regional labor rates — verify against your own costs before
            quoting.
          </p>
        </footer>

        {/* Spacer matches the slim summary bar so the footer is never covered */}
        {!isResultVisible && <div style={{ height: summaryBarHeight + 24 }} aria-hidden="true" />}
      </main>

      {/* Slim sticky summary bar — scrolls to the full result section on tap */}
      {!isResultVisible && (
        <div
          ref={summaryBarRef}
          className="shrink-0 border-t border-neutral-800 bg-neutral-900 px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.4)]"
        >
          <button
            type="button"
            onClick={scrollToResult}
            className="flex w-full min-h-[44px] items-center gap-3 rounded-xl bg-neutral-800 px-4 py-3 active:bg-neutral-700"
          >
            <span className="break-words text-xl font-black text-white">
              {`$${estimate.rangeLow.toLocaleString('en-US')}`} – {`$${estimate.rangeHigh.toLocaleString('en-US')}`}
            </span>
            <span className="text-sm font-bold text-neutral-300">·</span>
            <RiskBadge level={estimate.riskLevel} color={estimate.riskColor} />
            <span className="ml-auto text-2xl leading-none text-neutral-400">⌄</span>
          </button>
        </div>
      )}
    </div>
  );
}
