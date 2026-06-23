import { calculateJobCost, type JobConfiguration } from './pricingEngine';

describe('pricingEngine', () => {
  /**
   * 1. Baseline Sanity Check
   * A 12-inch Softwood tree with standard access and zero hazards should
   * produce the minimum possible base price: $20 * 12 = $240.
   */
  test('baseline sanity check: 12-inch softwood, no hazards, easy access', () => {
    const config: JobConfiguration = {
      treeSize: 12,
      woodDensity: 'softwood',
      hazards: [],
      treeHealth: [],
      accessLevel: 'easy',
    };

    const result = calculateJobCost(config);

    expect(result.minPrice).toBe(240);
    expect(result.maxPrice).toBe(Math.round(240 * 1.25));
    expect(result.combinedMultiplier).toBe(1.0);
    expect(result.riskProfile).toBe('STANDARD');
  });

  /**
   * 2. Compound Multiplier Validation
   * Manually compute: 24-inch Hardwood + Powerlines + Decay + easy access.
   * Expected base = 20 * 24 * 1.25 * 1.4 * 1.3 * 1.0 = 1,092
   * Expected max  = 1,092 * 1.25 = 1,365
   */
  test('compound multiplier validation: 24-inch hardwood, powerlines, decay', () => {
    const config: JobConfiguration = {
      treeSize: 24,
      woodDensity: 'hardwood',
      hazards: ['powerlines'],
      treeHealth: ['decay'],
      accessLevel: 'easy',
    };

    const expectedBase = 20 * 24 * 1.25 * 1.4 * 1.3 * 1.0;
    const expectedMin = Math.round(expectedBase);
    const expectedMax = Math.round(expectedBase * 1.25);

    const result = calculateJobCost(config);

    expect(result.minPrice).toBe(expectedMin);
    expect(result.maxPrice).toBe(expectedMax);
    expect(result.minPrice).toBe(1092);
    expect(result.maxPrice).toBe(1365);
    // 1.25 * 1.4 * 1.3 = 2.275, which exceeds the 2.0 critical threshold.
    expect(result.riskProfile).toBe('CRITICAL');
  });

  /**
   * 3. Boundary / Edge-Case Test
   * Absolute worst-case scenario at the maximum diameter with every multiplier active.
   */
  test('boundary edge case: 50-inch brittle, all hazards, all health issues, climbing only', () => {
    const config: JobConfiguration = {
      treeSize: 50,
      woodDensity: 'brittle',
      hazards: ['powerlines', 'house', 'fences'],
      treeHealth: ['decay', 'lean', 'deadwood'],
      accessLevel: 'climbing_only',
    };

    const result = calculateJobCost(config);

    expect(Number.isFinite(result.minPrice)).toBe(true);
    expect(Number.isFinite(result.maxPrice)).toBe(true);
    expect(result.minPrice).toBeGreaterThan(0);
    expect(result.maxPrice).toBeGreaterThan(result.minPrice);
    expect(result.riskProfile).toBe('CRITICAL');

    // Sanity-check the multiplier is indeed above the critical threshold.
    expect(result.combinedMultiplier).toBeGreaterThan(2.0);
  });

  /**
   * 4. Input Sanitization Guardrail
   * If treeSize is 0 or negative, the engine should clamp to the minimum
   * threshold (12 inches) rather than returning 0 or NaN.
   */
  test('input sanitization: clamps invalid treeSize values to minimum threshold', () => {
    const zeroConfig: JobConfiguration = {
      treeSize: 0,
      woodDensity: 'softwood',
      hazards: [],
      treeHealth: [],
      accessLevel: 'easy',
    };

    const negativeConfig: JobConfiguration = {
      treeSize: -999,
      woodDensity: 'softwood',
      hazards: [],
      treeHealth: [],
      accessLevel: 'easy',
    };

    const NaNConfig: JobConfiguration = {
      treeSize: NaN,
      woodDensity: 'softwood',
      hazards: [],
      treeHealth: [],
      accessLevel: 'easy',
    };

    const zeroResult = calculateJobCost(zeroConfig);
    const negativeResult = calculateJobCost(negativeConfig);
    const nanResult = calculateJobCost(NaNConfig);

    expect(zeroResult.minPrice).toBe(240);
    expect(negativeResult.minPrice).toBe(240);
    expect(nanResult.minPrice).toBe(240);

    expect(Number.isFinite(zeroResult.minPrice)).toBe(true);
    expect(Number.isFinite(negativeResult.minPrice)).toBe(true);
    expect(Number.isFinite(nanResult.minPrice)).toBe(true);
  });
});
