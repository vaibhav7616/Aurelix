import { useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { post } from '../../lib/api';
import { saveAttribution } from '../../lib/attribution';

/** /r/:code — partner tracking link: record the click, remember it, continue to the landing page. */
export function TrackRedirect() {
  const { code = '' } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  useEffect(() => {
    const sub = params.get('sub') ?? undefined;
    const clickId = params.get('click_id') ?? undefined;
    post<{ valid: boolean; landing: string; code?: string; sub?: string | null }>('/api/v1/public/aff-click', { code, sub, clickId })
      .then((r) => {
        if (r.valid && r.code) saveAttribution({ aff: r.code, sub: sub ?? r.sub ?? undefined, clickId });
        nav(r.landing || '/', { replace: true });
      })
      .catch(() => nav('/', { replace: true }));
  }, [code, params, nav]);
  return <div className="min-h-[50vh] flex items-center justify-center text-xs text-mute">Opening Aurelix…</div>;
}
