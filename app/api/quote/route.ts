import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
- Calculated Price Range: $${minPrice} to $${maxPrice}

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
