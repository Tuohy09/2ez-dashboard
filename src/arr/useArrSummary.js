import { useCallback, useEffect, useState } from 'react';
import { arrRequest } from './api';

export default function useArrSummary(service) {
  const [state, setState] = useState({ service, summary: null, error: '' });
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController(); let pending = false;
    const poll = async () => {
      if (pending) return;
      pending = true;
      try {
        const summary = await arrRequest(service, 'summary', { signal: controller.signal });
        if (!controller.signal.aborted) setState({ service, summary, error: '' });
      } catch (error) { if (!controller.signal.aborted) setState(previous => ({ service, summary: previous.service === service ? previous.summary : null, error: error.message })); }
      finally { pending = false; }
    };
    poll(); const timer = setInterval(poll, 15000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [service, revision]);
  return { ...(state.service === service ? state : { summary: null, error: '' }), refresh };
}
