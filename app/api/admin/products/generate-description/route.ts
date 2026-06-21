import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

const groqKey = process.env.GROQ_API_KEY;

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function tokenMatchesProject(token: string, projectRef: string): boolean {
  if (!projectRef) return false;
  const normalized = token.replace(/^"+|"+$/g, '');
  const payload = decodeJwtPayload(normalized);
  const ref = typeof payload?.ref === 'string' ? payload.ref : '';
  if (ref && ref === projectRef) return true;
  const iss = typeof payload?.iss === 'string' ? payload.iss : '';
  return iss.includes(`https://${projectRef}.supabase.co/auth/v1`);
}

function getAccessToken(request: Request): string | null {
  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0] || '';
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const t = authHeader.slice(7).trim();
    if (tokenMatchesProject(t, projectRef)) return t;
  }
  const cookieHeader = request.headers.get('cookie') || '';
  const directMatch = cookieHeader.match(/\bsb-access-token=([^;]+)/);
  if (directMatch) {
    const t = decodeURIComponent(directMatch[1].trim());
    if (tokenMatchesProject(t, projectRef)) return t;
  }
  const projectScopedMatch = cookieHeader.match(/\bsb-[a-z0-9]+-access-token=([^;]+)/i);
  if (projectScopedMatch) {
    const t = decodeURIComponent(projectScopedMatch[1].trim());
    if (tokenMatchesProject(t, projectRef)) return t;
  }
  const authCookie = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('sb-') && (c.includes('-auth-token') || c.includes('auth')));
  if (!authCookie) return null;
  const value = authCookie.split('=').slice(1).join('=').trim();
  const decoded = decodeURIComponent(value);
  try {
    const parsed = JSON.parse(decoded);
    if (Array.isArray(parsed) && parsed[0] && tokenMatchesProject(parsed[0], projectRef)) return parsed[0];
    if (parsed?.access_token && tokenMatchesProject(parsed.access_token, projectRef)) return parsed.access_token;
    if (typeof parsed === 'string' && tokenMatchesProject(parsed, projectRef)) return parsed;
  } catch {
    if (tokenMatchesProject(decoded, projectRef)) return decoded;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const token = getAccessToken(request);
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    const { data: profile } = await supabaseAdmin
      .from('profiles').select('role').eq('id', user.id).single();
    const role = profile?.role != null ? String(profile.role) : '';
    if (role !== 'admin' && role !== 'staff') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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
