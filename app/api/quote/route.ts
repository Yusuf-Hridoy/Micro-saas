import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { checkRateLimit } from '@vercel/firewall';
import { calculatePrice, type JobConfiguration } from '@/utils/pricingEngine';

export interface QuoteRequestBody extends JobConfiguration {}

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

    const estimate = calculatePrice({
      treeSize,
      treeHeight: treeHeight ?? 30,
      woodDensity,
      hazards: hazards as JobConfiguration['hazards'],
      treeHealth: treeHealth as JobConfiguration['treeHealth'],
      accessLevel,
      addOns: addOns as JobConfiguration['addOns'] ?? [],
    });

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error('GEMINI_API_KEY is not set in environment variables');
      return NextResponse.json(
        {
          error: 'Gemini API key is missing. Server configuration is incomplete.',
        },
        { status: 500 }
      );
    }


    const prompt = `You are a master arborist insurance adjuster and pricing risk actuary. The user is bidding on a job with these specs:
- Size: ${treeSize} inches in diameter
- Wood Type: ${woodDensity}
- Hazards: ${hazards.join(', ') || 'None'}
- Tree Health: ${treeHealth.join(', ') || 'Completely Healthy'}
- Calculated Price Range: $${estimate.rangeLow.toLocaleString('en-US')} to $${estimate.rangeHigh.toLocaleString('en-US')}

Based on these risks, generate exactly 3 powerful, authoritative, professional bullet points that the arborist can read or show directly to the homeowner to justify why this specific job commands this price premium. Focus on safety factors, advanced rigging equipment required, precision climbing liabilities, and potential property damage prevention. Keep it completely factual, objective, and clear. Do not include any introductory sentences or concluding text. Return ONLY the 3 bullet points.`;

    const modelName = 'gemini-2.5-flash';
    console.log('Calling Gemini with model:', modelName);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });

    const result = await model.generateContent(prompt);
    const response = result.response;
    const textResponse = response.text();

    console.log('Gemini response received successfully');

    return NextResponse.json({ justifications: textResponse });
  } catch (error) {
    // Log the full error server-side for debugging.
    console.error('Gemini API error:', error);

    let message = 'Unknown error occurred';
    if (error instanceof Error) {
      message = error.message;
    }

    // Try to extract Google API error details if present.
    const googleError = error as { message?: string; response?: { data?: unknown } };
    if (googleError?.message) {
      console.error('Error message:', googleError.message);
    }
    if (googleError?.response?.data) {
      console.error('Google API error data:', JSON.stringify(googleError.response.data, null, 2));
    }

    return NextResponse.json(
      { error: 'Failed to generate justifications.', details: message },
      { status: 500 }
    );
  }
}
