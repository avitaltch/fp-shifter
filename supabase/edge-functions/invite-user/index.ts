import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'FORBIDDEN' }, 403);
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
      return jsonResponse({ error: 'FORBIDDEN' }, 403);
    }

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('role, deleted_at')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !profile || profile.role !== 'Admin' || profile.deleted_at != null) {
      return jsonResponse({ error: 'FORBIDDEN' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? '')
      .trim()
      .toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ error: 'INVITE_FAILED' }, 400);
    }

    const siteUrl = Deno.env.get('SITE_URL') || 'https://fp-shifter.vercel.app';
    const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/login`,
    });

    if (inviteError) {
      const msg = (inviteError.message || '').toLowerCase();
      if (
        msg.includes('already') ||
        msg.includes('registered') ||
        msg.includes('exists') ||
        msg.includes('duplicate')
      ) {
        return jsonResponse({ error: 'ALREADY_EXISTS' }, 409);
      }
      console.error('inviteUserByEmail failed', inviteError);
      return jsonResponse({ error: 'INVITE_FAILED' }, 500);
    }

    return jsonResponse({ ok: true, email }, 200);
  } catch (err) {
    console.error('invite-user unexpected error', err);
    return jsonResponse({ error: 'INVITE_FAILED' }, 500);
  }
});
