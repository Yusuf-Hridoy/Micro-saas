export type WoodDensity = 'softwood' | 'hardwood' | 'brittle';
export type AccessLevel = 'easy' | 'climbing_only';
export type Hazard = 'powerlines' | 'house' | 'fences';
export type HealthIssue = 'decay' | 'lean' | 'deadwood';

export interface JobConfiguration {
  treeSize: number;
  woodDensity: WoodDensity;
  hazards: Hazard[];
  treeHealth: HealthIssue[];
  accessLevel: AccessLevel;
}

export interface JobCostEstimate {
  minPrice: number;
  maxPrice: number;
  combinedMultiplier: number;
  riskProfile: 'CRITICAL' | 'HIGH' | 'STANDARD';
}

const BASE_RATE = 20;
const MIN_TREE_SIZE = 12;
const MAX_TREE_SIZE = 50;

const DENSITY_COEFFICIENTS: Record<WoodDensity, number> = {
  softwood: 1.0,
  hardwood: 1.25,
  brittle: 1.45,
};

const HAZARD_MULTIPLIERS: Record<Hazard, number> = {
  powerlines: 1.4,
  house: 1.35,
  fences: 1.15,
};

const HEALTH_MULTIPLIERS: Record<HealthIssue, number> = {
  decay: 1.3,
  lean: 1.25,
  deadwood: 1.2,
};

const ACCESS_MULTIPLIERS: Record<AccessLevel, number> = {
  easy: 1.0,
  climbing_only: 1.35,
};

function sanitizeTreeSize(treeSize: number): number {
  if (!Number.isFinite(treeSize) || treeSize < MIN_TREE_SIZE) {
    return MIN_TREE_SIZE;
  }
  if (treeSize > MAX_TREE_SIZE) {
    return MAX_TREE_SIZE;
  }
  return treeSize;
}

export function calculateJobCost(config: JobConfiguration): JobCostEstimate {
  const treeSize = sanitizeTreeSize(config.treeSize);

  const densityCoef = DENSITY_COEFFICIENTS[config.woodDensity];
  const accessMultiplier = ACCESS_MULTIPLIERS[config.accessLevel];

  const hazardProduct = config.hazards.reduce(
    (product, hazard) => product * HAZARD_MULTIPLIERS[hazard],
    1
  );

  const healthProduct = config.treeHealth.reduce(
    (product, issue) => product * HEALTH_MULTIPLIERS[issue],
    1
  );

  const combinedMultiplier = densityCoef * hazardProduct * healthProduct * accessMultiplier;

  const calculatedBase =
    BASE_RATE * treeSize * densityCoef * hazardProduct * healthProduct * accessMultiplier;

  const minPrice = Math.round(calculatedBase);
  const maxPrice = Math.round(calculatedBase * 1.25);

  let riskProfile: JobCostEstimate['riskProfile'] = 'STANDARD';
  if (combinedMultiplier > 2.0) {
    riskProfile = 'CRITICAL';
  } else if (combinedMultiplier > 1.4) {
    riskProfile = 'HIGH';
  }

  return {
    minPrice,
    maxPrice,
    combinedMultiplier,
    riskProfile,
  };
}
