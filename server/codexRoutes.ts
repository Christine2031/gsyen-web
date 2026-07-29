import { getCodexBridgeHealth, startCodexDeviceLogin } from './codexBridge';
import { warmCodexAppServer } from './codexAppServer';
import { requireLocalBridgeAccess } from './localBridgeAuth';

export function registerCodexRoutes(app: any) {
  app.get('/api/codex/health', async (req: any, res: any) => {
    if (!(await requireLocalBridgeAccess(req, res))) return;
    const result = await getCodexBridgeHealth();
    if (result.available) warmCodexAppServer();
    return res.json(result);
  });

  app.post('/api/codex/login/start', async (req: any, res: any) => {
    if (!(await requireLocalBridgeAccess(req, res))) return;
    const result = await startCodexDeviceLogin();
    if (!result.started) {
      return res.status(503).json(result);
    }
    warmCodexAppServer();
    return res.json(result);
  });
}
