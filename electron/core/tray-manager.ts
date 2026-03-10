import { Tray, Menu, app, nativeImage } from 'electron';
import * as path from 'path';
import { agents } from './agent-manager';
import { getMainWindow } from './window-manager';
import { TG_CHARACTER_FACES } from '../constants';
import { isSuperAgent } from '../utils';

let tray: Tray | null = null;

const STATUS_EMOJI: Record<string, string> = {
  running: '🟢',
  waiting: '🟡',
  idle: '⚪',
  completed: '✅',
  error: '🔴',
};

const STATUS_SORT_ORDER: Record<string, number> = {
  running: 0,
  waiting: 1,
  error: 2,
  idle: 3,
  completed: 4,
};

export function initTray() {
  // __dirname is electron/dist/core/ at runtime, resources are at electron/resources/
  let iconPath = path.join(__dirname, '..', '..', 'resources', 'trayTemplate.png');
  // In production, resources are unpacked outside the asar archive
  iconPath = iconPath.replace('app.asar', 'app.asar.unpacked');
  const icon = nativeImage.createFromPath(iconPath);
  icon.setTemplateImage(true);

  tray = new Tray(icon);
  tray.setToolTip('Dorothy');
  rebuildTrayMenu();
}

export function rebuildTrayMenu() {
  if (!tray) return;

  const agentList = Array.from(agents.values());
  const running = agentList.filter(a => a.status === 'running').length;
  const waiting = agentList.filter(a => a.status === 'waiting').length;

  // Build header summary
  const parts: string[] = [];
  if (running > 0) parts.push(`${running} running`);
  if (waiting > 0) parts.push(`${waiting} waiting`);
  if (parts.length === 0) parts.push(agentList.length > 0 ? 'all idle' : 'no agents');
  const header = `Dorothy — ${parts.join(', ')}`;

  // Sort agents: running first, then waiting, then by sort order
  const sorted = [...agentList].sort((a, b) => {
    const orderA = STATUS_SORT_ORDER[a.status] ?? 3;
    const orderB = STATUS_SORT_ORDER[b.status] ?? 3;
    return orderA - orderB;
  });

  const template: Electron.MenuItemConstructorOptions[] = [
    { label: header, enabled: false },
    { type: 'separator' },
  ];

  if (sorted.length === 0) {
    template.push({ label: 'No agents configured', enabled: false });
  } else {
    for (const agent of sorted) {
      const isSuper = isSuperAgent(agent);
      const charEmoji = isSuper ? '👑' : (TG_CHARACTER_FACES[agent.character || ''] || '🤖');
      const statusEmoji = STATUS_EMOJI[agent.status] || '⚪';
      const name = agent.name || `Agent ${agent.id.slice(0, 6)}`;

      let label = `${charEmoji} ${name}  ${statusEmoji} ${agent.status}`;
      if (agent.currentTask && (agent.status === 'running' || agent.status === 'waiting')) {
        const task = agent.currentTask.length > 40
          ? agent.currentTask.slice(0, 40) + '…'
          : agent.currentTask;
        label += ` — ${task}`;
      }

      const agentId = agent.id;
      template.push({
        label,
        click: () => {
          const win = getMainWindow();
          if (win) {
            win.show();
            win.focus();
            win.webContents.send('tray:focus-agent', agentId);
          }
        },
      });
    }
  }

  template.push(
    { type: 'separator' },
    {
      label: 'Show Dorothy',
      click: () => {
        const win = getMainWindow();
        if (win) {
          win.show();
          win.focus();
        }
      },
    },
    {
      label: 'Quit Dorothy',
      click: () => {
        app.quit();
      },
    },
  );

  const menu = Menu.buildFromTemplate(template);
  tray.setContextMenu(menu);
}

export function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
