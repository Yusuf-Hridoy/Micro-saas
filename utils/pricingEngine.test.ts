import { calculatePrice, type JobConfiguration } from './pricingEngine';

describe('calculatePrice', () => {
  const baseConfig: JobConfiguration = {
    treeSize: 12,
    treeHeight: 30,
    woodDensity: 'softwood',
    hazards: [],
    treeHealth: [],
    accessLevel: 'easy',
    addOns: [],
  };

  /**
   * 1. Baseline Sanity Check
   * A 12-inch softwood tree at 30 ft with easy access and zero risk factors
   * should produce the minimum base price: $150 base labor, no add-ons.
   */
  test('baseline sanity check: 12-inch softwood, no risk factors', () => {
    const result = calculatePrice(baseConfig);

    expect(result.baseSubtotal).toBe(150);
    expect(result.hazardSubtotal).toBe(0);
    expect(result.healthSubtotal).toBe(0);
    expect(result.accessSubtotal).toBe(0);
    expect(result.addOnSubtotal).toBe(0);
    expect(result.total).toBe(150);
    expect(result.rangeLow).toBe(140); // 150 * 0.9 = 135 -> rounded to nearest 10
    expect(result.rangeHigh).toBe(170); // 150 * 1.1 = 165 -> rounded to nearest 10
    expect(result.riskLevel).toBe('STANDARD');
    expect(result.riskColor).toBe('green');
    expect(result.rationale).toContain('Standard removal');
  });

  /**
   * 2. Itemized Breakdown Integrity
   * The returned total must equal the sum of the shown subtotals, and every
   * active factor must appear as a visible line item.
   */
  test('itemized breakdown sums to total and lists active factors', () => {
    const config: JobConfiguration = {
      ...baseConfig,
      treeSize: 24,
      woodDensity: 'hardwood',
      hazards: ['powerlines'],
      treeHealth: ['decay'],
    };

    const result = calculatePrice(config);

    // Base: $400 (24-32" band) * 1.25 (hardwood) = $500
    expect(result.baseSubtotal).toBe(500);
    expect(result.hazardSubtotal).toBe(180);
    expect(result.healthSubtotal).toBe(90);
    expect(result.accessSubtotal).toBe(0);
    expect(result.addOnSubtotal).toBe(0);
    expect(result.total).toBe(770);
    expect(result.total).toBe(
      result.baseSubtotal +
        result.hazardSubtotal +
        result.healthSubtotal +
        result.accessSubtotal +
        result.addOnSubtotal
    );

    const labels = result.lineItems.map((item) => item.label);
    expect(labels).toContain('Powerline proximity');
    expect(labels).toContain('Active decay');
    expect(labels).toContain('hardwood ×1.25');
  });

  /**
   * 3. Height Add Coefficient
   * Every 10 ft above the 30 ft baseline adds $80 to the base labor calculation.
   */
  test('height add increases base labor above 30 ft', () => {
    const atBaseline = calculatePrice(baseConfig);
    const at40Ft = calculatePrice({ ...baseConfig, treeHeight: 40 });
    const at60Ft = calculatePrice({ ...baseConfig, treeHeight: 60 });

    expect(atBaseline.lineItems.some((i) => i.label.includes('Height add'))).toBe(false);
    expect(at40Ft.baseSubtotal).toBe(150 + 80); // baseline + $80 height add
    expect(at60Ft.baseSubtotal).toBe(150 + 240); // baseline + $240 height add
  });

  /**
   * 4. Add-on Services
   * Stump grinding and debris haul-away each add their own line item and subtotal.
   */
  test('add-on services appear as line items and update the total', () => {
    const stumpOnly = calculatePrice({ ...baseConfig, addOns: ['stump_grinding'] });
    const bothAddOns = calculatePrice({
      ...baseConfig,
      addOns: ['stump_grinding', 'debris_haulaway'],
    });

    expect(stumpOnly.addOnSubtotal).toBe(100);
    expect(stumpOnly.total).toBe(150 + 100);
    expect(stumpOnly.lineItems.some((i) => i.label === 'Stump grinding')).toBe(true);

    expect(bothAddOns.addOnSubtotal).toBe(220);
    expect(bothAddOns.total).toBe(150 + 220);
    expect(bothAddOns.lineItems.some((i) => i.label === 'Debris haul-away')).toBe(true);
  });

  /**
   * 5. Range Widens With Uncertainty
   * More active hazard + health factors should produce a wider spread.
   */
  test('range widens as hazard and health factors increase', () => {
    const noRisk = calculatePrice(baseConfig);
    const oneRisk = calculatePrice({ ...baseConfig, hazards: ['fences'] });
    const threeRisks = calculatePrice({
      ...baseConfig,
      hazards: ['powerlines', 'house'],
      treeHealth: ['lean'],
    });

    const spreadOf = (r: { rangeLow: number; rangeHigh: number; total: number }) =>
      (r.rangeHigh - r.rangeLow) / r.total;

    expect(spreadOf(oneRisk)).toBeGreaterThan(spreadOf(noRisk));
    expect(spreadOf(threeRisks)).toBeGreaterThan(spreadOf(oneRisk));
  });

  /**
   * 6. Risk Level Thresholds
   * 0-1 factors -> STANDARD, 2-3 -> ELEVATED, 4+ -> HIGH.
   */
  test('risk level follows active factor count thresholds', () => {
    const standard = calculatePrice(baseConfig);
    const elevated = calculatePrice({
      ...baseConfig,
      hazards: ['house'],
      treeHealth: ['deadwood'],
    });
    const high = calculatePrice({
      ...baseConfig,
      hazards: ['powerlines', 'house', 'fences'],
      treeHealth: ['decay', 'lean'],
    });

    expect(standard.riskLevel).toBe('STANDARD');
    expect(elevated.riskLevel).toBe('ELEVATED');
    expect(high.riskLevel).toBe('HIGH');
  });

  /**
   * 7. Boundary / Edge-Case Test
   * Absolute worst-case scenario at the maximum diameter with every risk active.
   */
  test('boundary edge case: 50-inch brittle, all factors, climbing only', () => {
    const config: JobConfiguration = {
      treeSize: 50,
      treeHeight: 30,
      woodDensity: 'brittle',
      hazards: ['powerlines', 'house', 'fences'],
      treeHealth: ['decay', 'lean', 'deadwood'],
      accessLevel: 'climbing_only',
      addOns: [],
    };

    const result = calculatePrice(config);

    expect(Number.isFinite(result.total)).toBe(true);
    expect(result.total).toBeGreaterThan(0);
    expect(result.rangeHigh).toBeGreaterThan(result.rangeLow);
    expect(result.riskLevel).toBe('HIGH');
  });

  /**
   * 8. Input Sanitization Guardrail
   * If treeSize is 0, negative, or NaN, the engine clamps to the minimum
   * threshold (12 inches) rather than returning 0 or NaN.
   */
  test('input sanitization: clamps invalid treeSize values to minimum threshold', () => {
    const zeroResult = calculatePrice({ ...baseConfig, treeSize: 0 });
    const negativeResult = calculatePrice({ ...baseConfig, treeSize: -999 });
    const nanResult = calculatePrice({ ...baseConfig, treeSize: NaN });

    expect(zeroResult.total).toBe(150);
    expect(negativeResult.total).toBe(150);
    expect(nanResult.total).toBe(150);

    expect(Number.isFinite(zeroResult.total)).toBe(true);
    expect(Number.isFinite(negativeResult.total)).toBe(true);
    expect(Number.isFinite(nanResult.total)).toBe(true);
  });

  /**
   * 9. Rationale Updates With Active Factors
   * The rationale sentence should name the currently selected hazards/health/access.
   */
  test('rationale names active factors', () => {
    const config: JobConfiguration = {
      ...baseConfig,
      hazards: ['powerlines'],
      treeHealth: ['decay'],
      accessLevel: 'climbing_only',
    };

    const result = calculatePrice(config);

    expect(result.rationale).toContain('powerline proximity');
    expect(result.rationale).toContain('active decay');
    expect(result.rationale).toContain('tight climbing-only access');
  });
});
