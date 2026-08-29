import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { ADRSchema, ExceptionSchema, HistoryEventSchema, ADR, Exception, HistoryEvent } from './schemas.js';

export class DecidrRepo {
  private baseDir: string;

  constructor(rootDir: string = process.cwd()) {
    this.baseDir = path.join(rootDir, '.decidr');
  }

  async getHistory(): Promise<HistoryEvent[]> {
    const historyDir = path.join(this.baseDir, 'history');
    const logPath = path.join(historyDir, 'events.jsonl');
    const events: HistoryEvent[] = [];

    try {
      // 1. Read event stream from events.jsonl
      try {
        const content = await fs.readFile(logPath, 'utf-8');
        const lines = content.trim().split('\n').filter(Boolean);
        for (const line of lines) {
          events.push(JSON.parse(line));
        }
      } catch {
        // Log file may not exist yet on initial run
      }

      // 2. Read individual event files if present
      const files = await fs.readdir(historyDir);
      for (const file of files) {
        if ((file.endsWith('.yaml') || file.endsWith('.yml')) && file !== 'events.jsonl') {
          const content = await fs.readFile(path.join(historyDir, file), 'utf-8');
          events.push(YAML.parse(content));
        }
      }

      return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (err) {
      return events;
    }
  }

  async init(): Promise<void> {
    const dirs = ['decisions', 'exceptions', 'history'];
    for (const dir of dirs) {
      await fs.mkdir(path.join(this.baseDir, dir), { recursive: true });
    }

    const defaultConfig = { version: '1.0', engine: 'hybrid' };
    await fs.writeFile(
      path.join(this.baseDir, 'config.yaml'),
      YAML.stringify(defaultConfig),
      'utf-8'
    );
  }

  async getActiveDecisions(): Promise<ADR[]> {
    const dirPath = path.join(this.baseDir, 'decisions');
    try {
      const files = await fs.readdir(dirPath);
      const decisions: ADR[] = [];

      for (const file of files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))) {
        const content = await fs.readFile(path.join(dirPath, file), 'utf-8');
        const parsed = YAML.parse(content);
        const valid = ADRSchema.parse(parsed);
        if (valid.status === 'active') decisions.push(valid);
      }
      return decisions;
    } catch {
      return [];
    }
  }

  async getActiveExceptions(): Promise<Exception[]> {
    const dirPath = path.join(this.baseDir, 'exceptions');
    try {
      const files = await fs.readdir(dirPath);
      const exceptions: Exception[] = [];
      const now = new Date();

      for (const file of files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))) {
        const content = await fs.readFile(path.join(dirPath, file), 'utf-8');
        const parsed = YAML.parse(content);
        const valid = ExceptionSchema.parse(parsed);

        if (new Date(valid.expires_at) > now) {
          exceptions.push(valid);
        }
      }
      return exceptions;
    } catch {
      return [];
    }
  }

  async logEvent(event: Omit<HistoryEvent, 'timestamp'>): Promise<void> {
    const logPath = path.join(this.baseDir, 'history', 'events.jsonl');
    const fullEvent: HistoryEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };
    HistoryEventSchema.parse(fullEvent);
    
    await fs.appendFile(logPath, JSON.stringify(fullEvent) + '\n', 'utf-8');
  }

  async saveException(exception: Exception): Promise<void> {
    ExceptionSchema.parse(exception);
    const filePath = path.join(this.baseDir, 'exceptions', `${exception.id}.yaml`);
    await fs.writeFile(filePath, YAML.stringify(exception), 'utf-8');
  }
}

export { appeal, AppealResult } from './appeals.js';