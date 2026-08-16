import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const baseCorsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function readAllowedOrigins() {
  const configured = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const siteUrl = Deno.env.get('SITE_URL');

  if (siteUrl) {
    configured.push(siteUrl);
  }

  return new Set(
    configured.flatMap((value) => {
      try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:' ? [url.origin] : [];
      } catch {
        return [];
      }
    })
  );
}

const allowedOrigins = readAllowedOrigins();

function corsHeaders(req: Request) {
  const origin = req.headers.get('Origin');
  const headers: Record<string, string> = { ...baseCorsHeaders };

  if (origin && allowedOrigins.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }

  return headers;
}

function jsonResponse(req: Request, body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const requestOrigin = req.headers.get('Origin');
  if (requestOrigin && !allowedOrigins.has(requestOrigin)) {
    return new Response('forbidden origin', { status: 403, headers: corsHeaders(req) });
  }

  if (req.method === 'OPTIONS') {
    if (!requestOrigin) {
      return new Response('forbidden origin', { status: 403, headers: corsHeaders(req) });
    }
    return new Response('ok', { headers: corsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse(req, { error: 'FORBIDDEN' }, 403);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(jwt);

    if (userError || !user) {
      return jsonResponse(req, { error: 'FORBIDDEN' }, 403);
    }

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('role, deleted_at')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !profile || profile.role !== 'Admin' || profile.deleted_at != null) {
      return jsonResponse(req, { error: 'FORBIDDEN' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? '')
      .trim()
      .toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse(req, { error: 'INVITE_FAILED' }, 400);
    }

    const siteUrl = Deno.env.get('SITE_URL');
    if (!siteUrl) {
      throw new Error('SITE_URL is required');
    }
    const parsedSiteUrl = new URL(siteUrl);
    if (parsedSiteUrl.protocol !== 'http:' && parsedSiteUrl.protocol !== 'https:') {
      throw new Error('SITE_URL must use HTTP(S)');
    }
    const loginUrl = new URL('/login', parsedSiteUrl).toString();
    const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: loginUrl,
    });

    if (inviteError) {
      const msg = (inviteError.message || '').toLowerCase();
      if (
        msg.includes('already') ||
        msg.includes('registered') ||
        msg.includes('exists') ||
        msg.includes('duplicate')
      ) {
        return jsonResponse(req, { error: 'ALREADY_EXISTS' }, 409);
      }
      console.error('inviteUserByEmail failed', inviteError);
      return jsonResponse(req, { error: 'INVITE_FAILED' }, 500);
    }

    return jsonResponse(req, { ok: true, email }, 200);
  } catch (err) {
    console.error('invite-user unexpected error', err);
    return jsonResponse(req, { error: 'INVITE_FAILED' }, 500);
  }
});
