import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { checkRateLimit } from '@vercel/firewall';
import { calculatePrice, type JobConfiguration } from '@/utils/pricingEngine';

export interface QuoteRequestBody extends JobConfiguration {}

interface GroundingFacts {
  diameter: number;
  height: number;
  density: string;
  access: string;
  activeHazards: string[];
  activeHealth: string[];
  activeAddOns: string[];
  lineItems: { label: string; amount: number; type: string }[];
  total: number;
  rangeLow: number;
  rangeHigh: number;
  riskLevel: string;
}

const SYSTEM_PROMPT = `You are helping an arborist explain a price to a customer. Justify ONLY the line items listed in the prompt.

Instructions:
- Write exactly ONE short talking point (one sentence) for EACH active line item provided.
- An active line item is any line item with an amount greater than $0. Never generate a talking point for a $0 line item.
- If NO hazards and NO health factors are active, output exactly ONE short sentence saying the job is straightforward. Do not invent extra risk.

Density rule:
- Wood density only gets its own bullet when its line item amount is greater than $0 (multiplier > 1.00).
- If softwood is selected, produce NO density bullet.
- When a density bullet is generated, use the EXACT density name from the input (hardwood or brittle). Never substitute another wood type.

Hard rules:
- Do NOT mention any wood type, hazard, health condition, access type, or add-on that is not in the provided data.
- Do NOT invent safety standards (e.g. ANSI codes), specific weights, equipment names, or figures that were not provided.
- Do NOT restate or change dollar amounts; refer to factors qualitatively.
- Output ONLY bullet points, one per line. No introductions, conclusions, or headings.`;

function buildFacts(estimate: ReturnType<typeof calculatePrice>): GroundingFacts {
  return {
    diameter: estimate.lineItems.find((i) => i.label.includes('tree base labor'))?.label.match(/(\d+)″/)?.[1]
      ? Number(estimate.lineItems.find((i) => i.label.includes('tree base labor'))!.label.match(/(\d+)″/)![1])
      : 0,
    height: estimate.lineItems.find((i) => i.label.includes('Height add'))?.label.match(/(\d+) ft/)?.[1]
      ? Number(estimate.lineItems.find((i) => i.label.includes('Height add'))!.label.match(/(\d+) ft/)![1])
      : 30,
    density: estimate.lineItems.find((i) => i.label.includes('×'))?.label.split(' ')[0] ?? 'softwood',
    access: estimate.lineItems.find((i) => i.type === 'access')?.label ?? 'Easy bucket access',
    activeHazards: estimate.lineItems.filter((i) => i.type === 'hazard').map((i) => i.label),
    activeHealth: estimate.lineItems.filter((i) => i.type === 'health').map((i) => i.label),
    activeAddOns: estimate.lineItems.filter((i) => i.type === 'addon').map((i) => i.label),
    lineItems: estimate.lineItems.map((i) => ({ label: i.label, amount: i.amount, type: i.type })),
    total: estimate.total,
    rangeLow: estimate.rangeLow,
    rangeHigh: estimate.rangeHigh,
    riskLevel: estimate.riskLevel,
  };
}

function formatUserPrompt(facts: GroundingFacts): string {
  const activeFactorCount = facts.activeHazards.length + facts.activeHealth.length;
  const riskNote = activeFactorCount === 0
    ? 'This is a straightforward job with no special hazards or health issues.'
    : `Risk level: ${facts.riskLevel}.`;

  // Only justify line items that actually contributed to the price.
  const itemsToJustify = facts.lineItems.filter((i) => i.amount > 0);

  return `Use only these facts. Do not add anything not listed here.

Tree: ${facts.diameter}" diameter, ${facts.height} ft tall, ${facts.density} density
Access: ${facts.access}
Active hazards: ${facts.activeHazards.join(', ') || 'None'}
Active structural health issues: ${facts.activeHealth.join(', ') || 'None'}
Add-ons: ${facts.activeAddOns.join(', ') || 'None'}
${riskNote}

Write one talking point for EACH of these line items:
${itemsToJustify.map((i) => `- ${i.label}`).join('\n')}

Output exactly ${itemsToJustify.length} bullet point(s).`;
}

function hasInventedSpecifics(text: string, facts: GroundingFacts): boolean {
  const lower = text.toLowerCase();

  // Disallowed invented standards / equipment / weight patterns
  const inventedPatterns = [
    /ansi\s?\w?/i,
    /iso\s?\d/i,
    /osha\s?\d/i,
    /\b\d+\s?(ton|tons|lb|lbs|pound|pounds|kg)\b/i,
    /\b(crane|bucket truck|chipper|stump grinder|climbing saddle|rigging block|pulley|winch|chainsaw|hydraulic lift|aerial lift|boom lift)\b/i,
  ];

  if (inventedPatterns.some((p) => p.test(text))) {
    return true;
  }

  // Check for dollar amounts or large specific figures (we asked it not to restate numbers)
  if (/\$\d/.test(text) || /\b\d{3,}\b/.test(text)) {
    return true;
  }

  // Build the set of active specific terms for this job.
  const activeTerms = new Set<string>();
  activeTerms.add(facts.density.toLowerCase());
  facts.activeHazards.forEach((h) => {
    const lower = h.toLowerCase();
    activeTerms.add(lower);
    if (lower.includes('house')) activeTerms.add('house');
    if (lower.includes('powerline')) activeTerms.add('powerline');
    if (lower.includes('powerline')) activeTerms.add('powerlines');
    if (lower.includes('fence')) activeTerms.add('fence');
    if (lower.includes('fence')) activeTerms.add('fences');
  });
  facts.activeHealth.forEach((h) => {
    const lower = h.toLowerCase();
    activeTerms.add(lower);
    if (lower.includes('decay')) activeTerms.add('decay');
    if (lower.includes('lean')) activeTerms.add('lean');
    if (lower.includes('deadwood')) activeTerms.add('deadwood');
  });
  activeTerms.add(facts.access.toLowerCase());
  if (facts.access.toLowerCase().includes('climbing')) {
    activeTerms.add('climbing');
    activeTerms.add('tight');
  }
  if (facts.access.toLowerCase().includes('bucket')) {
    activeTerms.add('bucket');
    activeTerms.add('easy');
  }
  facts.activeAddOns.forEach((a) => {
    const lower = a.toLowerCase();
    activeTerms.add(lower);
    if (lower.includes('stump')) activeTerms.add('stump');
    if (lower.includes('debris')) activeTerms.add('debris');
  });

  // Any wood/hazard/health/access/add-on term NOT active in this job is forbidden.
  const allSpecificTerms = [
    'softwood', 'hardwood', 'brittle',
    'powerlines', 'powerline', 'house', 'fences', 'fence',
    'decay', 'lean', 'deadwood',
    'easy bucket access', 'tight climbing only', 'climbing only',
    'stump grinding', 'debris haul-away', 'debris haulaway',
  ];
  const forbiddenTerms = allSpecificTerms.filter((t) => !activeTerms.has(t));

  for (const term of forbiddenTerms) {
    if (lower.includes(term)) return true;
  }

  return false;
}

function groundedFallback(facts: GroundingFacts): string {
  const activeFactorCount = facts.activeHazards.length + facts.activeHealth.length;

  if (activeFactorCount === 0 && facts.activeAddOns.length === 0) {
    return '• Standard removal with straightforward access — priced at typical rates.';
  }

  const bullets: string[] = [];
  bullets.push(`• Base labor covers the ${facts.diameter}" tree removal.`);

  if (facts.density !== 'softwood') {
    bullets.push(`• ${facts.density} density increases the effort required for removal.`);
  }

  facts.activeHazards.forEach((h) => {
    bullets.push(`• ${h} requires controlled work and adds liability.`);
  });

  facts.activeHealth.forEach((h) => {
    bullets.push(`• ${h} requires careful handling to protect people and property.`);
  });

  if (facts.access === 'Tight climbing only') {
    bullets.push('• Tight climbing-only access increases the time and skill required.');
  }

  facts.activeAddOns.forEach((a) => {
    bullets.push(`• ${a} is included as requested.`);
  });

  return bullets.join('\n');
}

function appendMissingFactorBullets(
  bullets: string[],
  facts: GroundingFacts
): string[] {
  const combined = bullets.join(' ').toLowerCase();

  const ensureMentioned = (
    keywords: string[],
    fallback: string
  ) => {
    if (!keywords.some((k) => combined.includes(k))) {
      bullets.push(fallback);
    }
  };

  facts.activeHazards.forEach((h) => {
    if (h.toLowerCase().includes('house')) {
      ensureMentioned(['house'], '• House proximity requires extra care to protect nearby property.');
    } else if (h.toLowerCase().includes('powerline')) {
      ensureMentioned(['powerline', 'powerlines'], '• Powerline proximity adds risk and requires careful work.');
    } else if (h.toLowerCase().includes('fence')) {
      ensureMentioned(['fence', 'fences'], '• Fence proximity requires care to avoid damage.');
    }
  });

  facts.activeHealth.forEach((h) => {
    if (h.toLowerCase().includes('decay')) {
      ensureMentioned(['decay'], '• Active decay means the tree must be handled carefully.');
    } else if (h.toLowerCase().includes('lean')) {
      ensureMentioned(['lean'], '• Structural lean requires controlled rigging and removal.');
    } else if (h.toLowerCase().includes('deadwood')) {
      ensureMentioned(['deadwood'], '• Deadwood adds complexity and must be removed with care.');
    }
  });

  if (facts.density !== 'softwood') {
    ensureMentioned(
      [facts.density.toLowerCase()],
      `• ${facts.density} density increases the effort required for removal.`
    );
  }

  if (facts.access.toLowerCase().includes('climbing')) {
    ensureMentioned(['climbing', 'tight'], '• Tight climbing-only access increases the time and skill required.');
  }

  facts.activeAddOns.forEach((a) => {
    if (a.toLowerCase().includes('stump')) {
      ensureMentioned(['stump'], '• Stump grinding is included as requested.');
    } else if (a.toLowerCase().includes('debris')) {
      ensureMentioned(['debris'], '• Debris haul-away is included as requested.');
    }
  });

  return bullets;
}

function filterAndGround(
  raw: string,
  facts: GroundingFacts,
  allowFallback = true
): { text: string; dropped: number } {
  const lines = raw
    .split('\n')
    .map((line) => line.replace(/^\s*[\-*•\d.]+\s*/, '').trim())
    .filter((line) => line.length > 0);

  const kept: string[] = [];
  let dropped = 0;

  for (const line of lines) {
    if (hasInventedSpecifics(line, facts)) {
      console.warn('Grounding check dropped AI line:', line);
      dropped++;
      continue;
    }
    kept.push(`• ${line}`);
  }

  if (allowFallback && kept.length === 0) {
    return { text: groundedFallback(facts), dropped };
  }

  const complete = appendMissingFactorBullets(kept, facts);
  return { text: complete.join('\n'), dropped };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Firewall guardrail: enforce the Vercel WAF rate-limit rule tied to this
  // endpoint. The rule (configured in the Vercel dashboard with the matching
  // rate limit ID) defaults to the client IP address when no custom key is
  // supplied, giving us a per-user/per-IP daily quota.
  try {
    const { rateLimited } = await checkRateLimit('driveway-quote-daily-limit', {
      request,
    });

    if (rateLimited) {
      return NextResponse.json(
        {
          error:
            'Daily driveway quota reached (5 requests/day). Please try again tomorrow.',
        },
        { status: 429 }
      );
    }
  } catch (rateLimitError) {
    // Fail open if the firewall service is unreachable or the rule is not yet
    // configured, but log loudly so the issue is visible.
    console.error('Vercel Firewall rate-limit check failed:', rateLimitError);
  }

  let estimate: ReturnType<typeof calculatePrice> | undefined;
  let facts: GroundingFacts | undefined;

  try {
    const body: QuoteRequestBody = await request.json();

    const {
      treeSize,
      treeHeight,
      woodDensity,
      hazards,
      treeHealth,
      accessLevel,
      addOns,
    } = body;

    estimate = calculatePrice({
      treeSize,
      treeHeight: treeHeight ?? 30,
      woodDensity,
      hazards: hazards as JobConfiguration['hazards'],
      treeHealth: treeHealth as JobConfiguration['treeHealth'],
      accessLevel,
      addOns: addOns as JobConfiguration['addOns'] ?? [],
    });

    facts = buildFacts(estimate);
  } catch (parseOrCalcError) {
    console.error('Failed to parse request or calculate estimate:', parseOrCalcError);
    return NextResponse.json(
      { error: 'Invalid request data.' },
      { status: 400 }
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not set in environment variables');
    return NextResponse.json(
      { justifications: groundedFallback(facts) },
      { status: 200 }
    );
  }

  try {
    const modelName = 'gemini-2.5-flash';
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: SYSTEM_PROMPT,
    });

    console.log('Calling Gemini with grounded facts:', JSON.stringify(facts, null, 2));

    const result = await model.generateContent(formatUserPrompt(facts));
    const response = result.response;
    const rawText = response.text();

    console.log('Gemini raw response:', rawText);

    const { text: groundedText, dropped } = filterAndGround(rawText, facts);

    if (dropped > 0) {
      console.warn(`Grounding check dropped ${dropped} line(s); returning cleaned output.`);
    }

    return NextResponse.json({ justifications: groundedText });
  } catch (error) {
    console.error('Gemini API error:', error);

    let message = 'Unknown error occurred';
    if (error instanceof Error) {
      message = error.message;
    }

    const googleError = error as { message?: string; response?: { data?: unknown } };
    if (googleError?.message) {
      console.error('Error message:', googleError.message);
    }
    if (googleError?.response?.data) {
      console.error('Google API error data:', JSON.stringify(googleError.response.data, null, 2));
    }

    // Graceful fallback: return deterministic, grounded bullets so the card still
    // provides useful talking points even when the LLM is unavailable.
    return NextResponse.json(
      { justifications: groundedFallback(facts) },
      { status: 200 }
    );
  }
}
