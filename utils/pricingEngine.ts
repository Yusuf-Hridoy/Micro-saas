export type WoodDensity = 'softwood' | 'hardwood' | 'brittle';
export type AccessLevel = 'easy' | 'climbing_only';
export type Hazard = 'powerlines' | 'house' | 'fences';
export type HealthIssue = 'decay' | 'lean' | 'deadwood';
export type AddOn = 'stump_grinding' | 'debris_haulaway';

export interface JobConfiguration {
  treeSize: number;
  treeHeight: number; // feet; default 30
  woodDensity: WoodDensity;
  hazards: Hazard[];
  treeHealth: HealthIssue[];
  accessLevel: AccessLevel;
  addOns: AddOn[];
}

export type LineItemType = 'base' | 'hazard' | 'health' | 'access' | 'addon';

export interface LineItem {
  label: string;
  amount: number;
  type: LineItemType;
}

export interface PriceEstimate {
  lineItems: LineItem[];
  baseSubtotal: number;
  hazardSubtotal: number;
  healthSubtotal: number;
  accessSubtotal: number;
  addOnSubtotal: number;
  total: number;
  rangeLow: number;
  rangeHigh: number;
  riskLevel: 'STANDARD' | 'ELEVATED' | 'HIGH';
  riskColor: 'green' | 'amber' | 'red';
  rationale: string;
}

// ---------------------------------------------------------------------------
// Centralized placeholder coefficients — all flagged [VERIFY].
// Edit these values with a real arborist; never scatter magic numbers in UI code.
// ---------------------------------------------------------------------------

const PRICING_CONFIG = {
  // Tree diameter bands for base labor cost (inches -> dollars) — [VERIFY]
  DIAMETER_BANDS: [
    { max: 18, base: 150 }, // 12–18"
    { max: 24, base: 250 }, // 18–24"
    { max: 32, base: 400 }, // 24–32"
    { max: 40, base: 600 }, // 32–40"
    { max: 50, base: 900 }, // 40–50"
  ],

  // Height add: +$80 for every 10 ft above 30 ft — [VERIFY]
  HEIGHT_ADD_PER_10FT_ABOVE_30: 80,
  HEIGHT_BASELINE_FT: 30,

  // Density multiplier applied to (base labor + height add) — [VERIFY]
  DENSITY_MULTIPLIERS: {
    softwood: 1.0,
    hardwood: 1.25,
    brittle: 1.15,
  } as Record<WoodDensity, number>,

  // Hazard flat adds (liability/proximity) — [VERIFY]
  HAZARD_ADDS: {
    powerlines: 180,
    house: 150,
    fences: 70,
  } as Record<Hazard, number>,

  // Structural-health flat adds (liability/risk) — [VERIFY]
  HEALTH_ADDS: {
    decay: 90,
    lean: 110,
    deadwood: 80,
  } as Record<HealthIssue, number>,

  // Access difficulty flat adds — [VERIFY]
  ACCESS_ADDS: {
    easy: 0,
    climbing_only: 120,
  } as Record<AccessLevel, number>,

  // Optional service add-ons — [VERIFY]
  ADD_ON_PRICES: {
    stump_grinding: 100,
    debris_haulaway: 120,
  } as Record<AddOn, number>,

  // Range uncertainty widens with number of hazard + health factors — [VERIFY]
  SPREAD_BASE: 0.10,
  SPREAD_PER_FACTOR: 0.03,
  SPREAD_MAX: 0.30,

  // Risk thresholds by active hazard + health factor count — [VERIFY]
  RISK_THRESHOLDS: {
    STANDARD: { max: 1, color: 'green' as const },
    ELEVATED: { max: 3, color: 'amber' as const },
    HIGH: { max: Infinity, color: 'red' as const },
  },

  // Valid tree-size bounds — [VERIFY]
  MIN_TREE_SIZE: 12,
  MAX_TREE_SIZE: 50,

  // Tree height slider bounds — [VERIFY]
  MIN_TREE_HEIGHT: 15,
  MAX_TREE_HEIGHT: 90,
  TREE_HEIGHT_STEP: 5,
} as const;

// Exported input bounds so the UI never hard-codes them.
export const MIN_TREE_SIZE = PRICING_CONFIG.MIN_TREE_SIZE;
export const MAX_TREE_SIZE = PRICING_CONFIG.MAX_TREE_SIZE;
export const MIN_TREE_HEIGHT = PRICING_CONFIG.MIN_TREE_HEIGHT;
export const MAX_TREE_HEIGHT = PRICING_CONFIG.MAX_TREE_HEIGHT;
export const TREE_HEIGHT_STEP = PRICING_CONFIG.TREE_HEIGHT_STEP;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeTreeSize(treeSize: number): number {
  const { MIN_TREE_SIZE, MAX_TREE_SIZE } = PRICING_CONFIG;
  if (!Number.isFinite(treeSize) || treeSize < MIN_TREE_SIZE) {
    return MIN_TREE_SIZE;
  }
  if (treeSize > MAX_TREE_SIZE) {
    return MAX_TREE_SIZE;
  }
  return treeSize;
}

function sanitizeTreeHeight(treeHeight: number): number {
  if (!Number.isFinite(treeHeight) || treeHeight < 1) {
    return PRICING_CONFIG.HEIGHT_BASELINE_FT;
  }
  return treeHeight;
}

function getBaseLaborForDiameter(treeSize: number): number {
  const size = sanitizeTreeSize(treeSize);
  // Use the centralized diameter bands: upper bound is exclusive so bands do not overlap.
  for (const band of PRICING_CONFIG.DIAMETER_BANDS) {
    if (size < band.max) {
      return band.base;
    }
  }
  return PRICING_CONFIG.DIAMETER_BANDS[PRICING_CONFIG.DIAMETER_BANDS.length - 1].base;
}

function calculateHeightAdd(treeHeight: number): number {
  const height = sanitizeTreeHeight(treeHeight);
  const excess = Math.max(0, height - PRICING_CONFIG.HEIGHT_BASELINE_FT);
  return (excess / 10) * PRICING_CONFIG.HEIGHT_ADD_PER_10FT_ABOVE_30;
}

function roundToNearestTen(value: number): number {
  return Math.round(value / 10) * 10;
}

function humanizeList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  const allButLast = items.slice(0, -1).join(', ');
  return `${allButLast} and ${items[items.length - 1]}`;
}

function buildRationale(
  activeHazards: Hazard[],
  activeHealth: HealthIssue[],
  accessLevel: AccessLevel
): string {
  const factorLabels: string[] = [];

  for (const hazard of activeHazards) {
    if (hazard === 'powerlines') factorLabels.push('powerline proximity');
    if (hazard === 'house') factorLabels.push('house proximity');
    if (hazard === 'fences') factorLabels.push('fence proximity');
  }

  for (const issue of activeHealth) {
    if (issue === 'decay') factorLabels.push('active decay');
    if (issue === 'lean') factorLabels.push('structural lean');
    if (issue === 'deadwood') factorLabels.push('deadwood');
  }

  if (accessLevel === 'climbing_only') {
    factorLabels.push('tight climbing-only access');
  }

  if (factorLabels.length === 0) {
    return 'Standard removal with straightforward access — priced at typical rates.';
  }

  return `Priced toward the upper end due to ${humanizeList(factorLabels)}, which require controlled rigging and increase liability.`;
}

// ---------------------------------------------------------------------------
// Main pricing function
// ---------------------------------------------------------------------------

export function calculatePrice(config: JobConfiguration): PriceEstimate {
  const treeSize = sanitizeTreeSize(config.treeSize);
  const treeHeight = sanitizeTreeHeight(config.treeHeight);

  const baseLabor = getBaseLaborForDiameter(treeSize);
  const heightAdd = calculateHeightAdd(treeHeight);
  const subtotalBeforeDensity = baseLabor + heightAdd;

  const densityMultiplier = PRICING_CONFIG.DENSITY_MULTIPLIERS[config.woodDensity];
  const densityAdjustedSubtotal = subtotalBeforeDensity * densityMultiplier;
  const densityAdjustment = densityAdjustedSubtotal - subtotalBeforeDensity;

  const lineItems: LineItem[] = [];

  // Base labor line item
  lineItems.push({
    label: `${treeSize}″ tree base labor`,
    amount: baseLabor,
    type: 'base',
  });

  // Height add line item (only shown if non-zero)
  if (heightAdd > 0) {
    lineItems.push({
      label: `Height add (${treeHeight} ft)`,
      amount: heightAdd,
      type: 'base',
    });
  }

  // Density adjustment line item
  lineItems.push({
    label: `${config.woodDensity} ×${densityMultiplier.toFixed(2)}`,
    amount: densityAdjustment,
    type: 'base',
  });

  const baseSubtotal = baseLabor + heightAdd + densityAdjustment;

  // Hazard line items
  let hazardSubtotal = 0;
  for (const hazard of config.hazards) {
    const amount = PRICING_CONFIG.HAZARD_ADDS[hazard];
    hazardSubtotal += amount;
    lineItems.push({
      label:
        hazard === 'powerlines'
          ? 'Powerline proximity'
          : hazard === 'house'
            ? 'House proximity'
            : 'Fence proximity',
      amount,
      type: 'hazard',
    });
  }

  // Health line items
  let healthSubtotal = 0;
  for (const issue of config.treeHealth) {
    const amount = PRICING_CONFIG.HEALTH_ADDS[issue];
    healthSubtotal += amount;
    lineItems.push({
      label:
        issue === 'decay'
          ? 'Active decay'
          : issue === 'lean'
            ? 'Structural lean'
            : 'Deadwood',
      amount,
      type: 'health',
    });
  }

  // Access line item
  const accessSubtotal = PRICING_CONFIG.ACCESS_ADDS[config.accessLevel];
  lineItems.push({
    label:
      config.accessLevel === 'easy'
        ? 'Easy bucket access'
        : 'Tight climbing only',
    amount: accessSubtotal,
    type: 'access',
  });

  // Optional add-on line items
  let addOnSubtotal = 0;
  for (const addOn of config.addOns) {
    const amount = PRICING_CONFIG.ADD_ON_PRICES[addOn];
    addOnSubtotal += amount;
    lineItems.push({
      label:
        addOn === 'stump_grinding'
          ? 'Stump grinding'
          : 'Debris haul-away',
      amount,
      type: 'addon',
    });
  }

  const total = baseSubtotal + hazardSubtotal + healthSubtotal + accessSubtotal + addOnSubtotal;

  // Range widens with uncertainty based on hazard + health factor count.
  const factorCount = config.hazards.length + config.treeHealth.length;
  const spread = Math.min(
    PRICING_CONFIG.SPREAD_MAX,
    PRICING_CONFIG.SPREAD_BASE + factorCount * PRICING_CONFIG.SPREAD_PER_FACTOR
  );

  const rangeLow = roundToNearestTen(total * (1 - spread));
  const rangeHigh = roundToNearestTen(total * (1 + spread));

  // Risk level from active hazard + health factors.
  let riskLevel: PriceEstimate['riskLevel'];
  let riskColor: PriceEstimate['riskColor'];

  if (factorCount >= 4) {
    riskLevel = 'HIGH';
    riskColor = 'red';
  } else if (factorCount >= 2) {
    riskLevel = 'ELEVATED';
    riskColor = 'amber';
  } else {
    riskLevel = 'STANDARD';
    riskColor = 'green';
  }

  const rationale = buildRationale(config.hazards, config.treeHealth, config.accessLevel);

  return {
    lineItems,
    baseSubtotal,
    hazardSubtotal,
    healthSubtotal,
    accessSubtotal,
    addOnSubtotal,
    total,
    rangeLow,
    rangeHigh,
    riskLevel,
    riskColor,
    rationale,
  };
}
