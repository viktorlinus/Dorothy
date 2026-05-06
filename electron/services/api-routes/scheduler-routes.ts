import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as https from 'https';
import * as http from 'http';
import { RouteApp, RouteContext } from './types';

function sendDiscordWebhook(webhookUrl: string, taskId: string, status: string, summary?: string): void {
  const color = status === 'success' ? 0x57f287 : status === 'error' ? 0xed4245 : 0xfee75c;
  const emoji = status === 'success' ? '✅' : status === 'error' ? '❌' : '⚠️';
  const payload = JSON.stringify({
    embeds: [{
      title: `${emoji} Scheduled Task ${status}`,
      description: summary || `Task \`${taskId}\` finished with status: **${status}**`,
      color,
      footer: { text: `Task ID: ${taskId}` },
      timestamp: new Date().toISOString(),
    }],
  });

  try {
    const url = new URL(webhookUrl);
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    });
    req.on('error', () => { /* silently ignore */ });
    req.write(payload);
    req.end();
  } catch {
    // Silently ignore invalid URLs
  }
}

export function registerSchedulerRoutes(app: RouteApp, ctx: RouteContext): void {
  // POST /api/scheduler/status
  app.post('/api/scheduler/status', (req, sendJson) => {
    const { task_id, status, summary } = req.body as {
      task_id: string;
      status: 'running' | 'success' | 'error' | 'partial';
      summary?: string;
    };

    if (!task_id || !status) {
      sendJson({ error: 'task_id and status are required' }, 400);
      return;
    }

    const validStatuses = ['running', 'success', 'error', 'partial'];
    if (!validStatuses.includes(status)) {
      sendJson({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, 400);
      return;
    }

    try {
      const metadataPath = path.join(os.homedir(), '.dorothy', 'scheduler-metadata.json');
      let metadata: Record<string, Record<string, unknown>> = {};
      if (fs.existsSync(metadataPath)) {
        metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      }

      if (!metadata[task_id]) {
        metadata[task_id] = {};
      }
      metadata[task_id].lastRunStatus = status;
      metadata[task_id].lastRun = new Date().toISOString();
      if (summary) {
        metadata[task_id].lastRunSummary = summary;
      }

      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

      if (ctx.mainWindow && !ctx.mainWindow.isDestroyed()) {
        ctx.mainWindow.webContents.send('scheduler:task-status', { taskId: task_id, status, summary });
      }

      // Send Discord webhook if enabled for this task and status is terminal
      const taskNotifications = metadata[task_id]?.notifications as { discord?: boolean } | undefined;
      if ((status === 'success' || status === 'error' || status === 'partial') && taskNotifications?.discord) {
        const settingsPath = path.join(os.homedir(), '.dorothy', 'app-settings.json');
        try {
          const appSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
          if (appSettings.discordWebhookUrl) {
            sendDiscordWebhook(appSettings.discordWebhookUrl, task_id, status, summary);
          }
        } catch { /* settings not readable */ }
      }

      sendJson({ success: true });
    } catch (err) {
      sendJson({ error: `Failed to update status: ${err}` }, 500);
    }
  });
}
