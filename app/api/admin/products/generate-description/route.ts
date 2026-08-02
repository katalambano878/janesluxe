import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';

const groqKey = process.env.GROQ_API_KEY;

export async function POST(request: Request) {
  try {
    const gate = await requireAdmin(request);
    if ('response' in gate) return gate.response;

    if (!groqKey) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 503 });
    }

    const { imageUrl, productName, categoryName } = await request.json();

    if (!imageUrl) {
      return NextResponse.json({ error: 'Image URL is required' }, { status: 400 });
    }

    const contextParts = [productName && `Product name: "${productName}"`, categoryName && `Category: "${categoryName}"`].filter(Boolean);
    const context = contextParts.length > 0 ? `\n\nContext: ${contextParts.join('. ')}.` : '';

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          {
            role: 'system',
            content:
              'You are a product copywriter for YOUR_BRAND_NAME, a global sourcing and procurement brand based in Ghana. ' +
              'Write short, compelling product descriptions (2-3 sentences, max 300 characters). ' +
              'Be specific about what the product is and its key benefit. ' +
              'Use a warm, professional tone. Do not use hashtags or emojis. ' +
              'Return ONLY the description text, nothing else.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Write a short product description for this fashion product based on the image.${context}`,
              },
              {
                type: 'image_url',
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
        temperature: 0.7,
        max_tokens: 200,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Groq vision API error:', err);
      return NextResponse.json({ error: 'Failed to generate description' }, { status: 502 });
    }

    const data = await res.json();
    const description = data.choices?.[0]?.message?.content?.trim() || '';

    if (!description) {
      return NextResponse.json({ error: 'No description generated' }, { status: 500 });
    }

    return NextResponse.json({ description });
  } catch (error: any) {
    console.error('Generate description error:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
