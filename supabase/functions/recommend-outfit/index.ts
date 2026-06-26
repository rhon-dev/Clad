import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.21.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RATE_LIMIT = 20; // max calls per hour per user

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Rate limit check
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('recommendation_calls')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('called_at', oneHourAgo);

    if ((count ?? 0) >= RATE_LIMIT) {
      return new Response(
        JSON.stringify({ error: 'Rate limit reached. Try again in an hour.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { wardrobe, weather, occasion } = await req.json();

    if (!wardrobe || wardrobe.length === 0) {
      return new Response(JSON.stringify({ error: 'No wardrobe items provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Record this call for rate limiting
    await supabase.from('recommendation_calls').insert({ user_id: user.id });

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const weatherDesc = weather
      ? `Temperature: ${weather.temperature}°C, conditions: ${weather.description}`
      : 'Weather unknown';

    const prompt = `You are a personal stylist. Based on the wardrobe below, recommend a complete outfit.

Occasion: ${occasion}
Weather: ${weatherDesc}

Wardrobe (JSON):
${JSON.stringify(wardrobe, null, 2)}

Rules:
- Pick one item per category needed (e.g. one top, one bottom, one shoes)
- Use only item IDs from the wardrobe list
- Consider weather and occasion appropriateness
- Respond with ONLY valid JSON, no markdown:
{
  "item_ids": ["<uuid1>", "<uuid2>", ...],
  "rationale": "<2-3 sentence explanation of why this outfit works>"
}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    let parsed: { item_ids: string[]; rationale: string };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return new Response(
        JSON.stringify({ error: "Couldn't generate recommendation, please try again" }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate item_ids are from the wardrobe
    const validIds = new Set(wardrobe.map((w: { id: string }) => w.id));
    parsed.item_ids = parsed.item_ids.filter((id: string) => validIds.has(id));

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('recommend-outfit error:', err);
    return new Response(
      JSON.stringify({ error: "Couldn't generate recommendation, please try again" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
