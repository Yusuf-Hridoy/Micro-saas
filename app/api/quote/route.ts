import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export interface QuoteRequestBody {
  treeSize: number;
  woodDensity: 'softwood' | 'hardwood' | 'brittle';
  hazards: string[];
  treeHealth: string[];
  accessLevel: 'easy' | 'climbing_only';
  minPrice: number;
  maxPrice: number;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: QuoteRequestBody = await request.json();

    const {
      treeSize,
      woodDensity,
      hazards,
      treeHealth,
      minPrice,
      maxPrice,
    } = body;

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
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
- Calculated Price Range: $${minPrice} to $${maxPrice}

Based on these risks, generate exactly 3 powerful, authoritative, professional bullet points that the arborist can read or show directly to the homeowner to justify why this specific job commands this price premium. Focus on safety factors, advanced rigging equipment required, precision climbing liabilities, and potential property damage prevention. Keep it completely factual, objective, and clear. Do not include any introductory sentences or concluding text. Return ONLY the 3 bullet points.`;

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const textResponse = response.text ?? '';

    return NextResponse.json({ justifications: textResponse });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json(
      { error: 'Failed to generate justifications.', details: message },
      { status: 500 }
    );
  }
}
