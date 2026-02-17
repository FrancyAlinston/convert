/**
 * Centralized logging system for Convert.to.it
 * Provides structured logging with levels, timestamps, categories,
 * and an in-memory log buffer for the debug viewer.
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  category: string;
  message: string;
  data?: unknown;
}

const LEVEL_LABELS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.INFO]: "INFO",
  [LogLevel.WARN]: "WARN",
  [LogLevel.ERROR]: "ERROR",
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: "#888",
  [LogLevel.INFO]: "#1C77FF",
  [LogLevel.WARN]: "#f39c12",
  [LogLevel.ERROR]: "#e74c3c",
};

const LEVEL_CONSOLE: Record<LogLevel, typeof console.log> = {
  [LogLevel.DEBUG]: console.debug,
  [LogLevel.INFO]: console.info,
  [LogLevel.WARN]: console.warn,
  [LogLevel.ERROR]: console.error,
};

/** Maximum log entries kept in memory */
const MAX_LOG_ENTRIES = 500;

class Logger {
  /** In-memory log buffer */
  private entries: LogEntry[] = [];

  /** Minimum level to output to the console */
  private consoleLevel: LogLevel = LogLevel.DEBUG;

  /** Listeners for new log entries (used by the log viewer) */
  private listeners: Array<(entry: LogEntry) => void> = [];

  /** Suppression tracking to avoid duplicate spam */
  private suppressionMap = new Map<string, number>();

  /**
   * Set the minimum log level that appears in the console.
   * Logs below this level are still stored in the buffer.
   */
  setConsoleLevel(level: LogLevel) {
    this.consoleLevel = level;
  }

  /** Subscribe to new log entries */
  onEntry(callback: (entry: LogEntry) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  /** Get all stored log entries */
  getEntries(): ReadonlyArray<LogEntry> {
    return this.entries;
  }

  /** Clear all stored log entries */
  clear() {
    this.entries = [];
    this.suppressionMap.clear();
  }

  /** Export logs as a downloadable JSON string */
  export(): string {
    return JSON.stringify(this.entries.map(e => ({
      time: new Date(e.timestamp).toISOString(),
      level: LEVEL_LABELS[e.level],
      category: e.category,
      message: e.message,
      data: e.data,
    })), null, 2);
  }

  /**
   * Core log method.
   * @param level Log severity
   * @param category Source component (e.g. "FFmpeg", "Main", "ThreeJS")
   * @param message Human-readable message
   * @param data Optional structured data for debugging
   */
  log(level: LogLevel, category: string, message: string, data?: unknown) {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      category,
      message,
      data,
    };

    // Store in buffer
    this.entries.push(entry);
    if (this.entries.length > MAX_LOG_ENTRIES) {
      this.entries.shift();
    }

    // Notify listeners
    for (const listener of this.listeners) {
      try { listener(entry); } catch { /* don't let listener errors break logging */ }
    }

    // Console output
    if (level >= this.consoleLevel) {
      const time = new Date(entry.timestamp).toLocaleTimeString("en-US", { hour12: false });
      const label = LEVEL_LABELS[level];
      const color = LEVEL_COLORS[level];
      const consoleFn = LEVEL_CONSOLE[level];

      if (data !== undefined) {
        consoleFn(
          `%c[${time}] %c${label} %c[${category}]%c ${message}`,
          "color: #666", `color: ${color}; font-weight: bold`, "color: #999", "color: inherit",
          data
        );
      } else {
        consoleFn(
          `%c[${time}] %c${label} %c[${category}]%c ${message}`,
          "color: #666", `color: ${color}; font-weight: bold`, "color: #999", "color: inherit"
        );
      }
    }
  }

  /**
   * Log a message but suppress duplicates. Only the first occurrence
   * of a given key is logged; subsequent ones are silently counted.
   * @returns Whether the message was actually logged (first occurrence)
   */
  logOnce(level: LogLevel, category: string, message: string, suppressionKey?: string): boolean {
    const key = suppressionKey || `${category}:${message}`;
    const count = this.suppressionMap.get(key) || 0;
    this.suppressionMap.set(key, count + 1);
    if (count === 0) {
      this.log(level, category, message);
      return true;
    }
    return false;
  }

  /** Get suppression counts (useful for "X warnings suppressed" summaries) */
  getSuppressionCount(key: string): number {
    return this.suppressionMap.get(key) || 0;
  }

  // ---- Convenience methods ----

  debug(category: string, message: string, data?: unknown) {
    this.log(LogLevel.DEBUG, category, message, data);
  }
  info(category: string, message: string, data?: unknown) {
    this.log(LogLevel.INFO, category, message, data);
  }
  warn(category: string, message: string, data?: unknown) {
    this.log(LogLevel.WARN, category, message, data);
  }
  error(category: string, message: string, data?: unknown) {
    this.log(LogLevel.ERROR, category, message, data);
  }

  /**
   * Create a scoped child logger that automatically prefixes a category.
   * Useful inside handlers: `const log = logger.scoped("FFmpeg");`
   */
  scoped(category: string) {
    return {
      debug: (msg: string, data?: unknown) => this.debug(category, msg, data),
      info: (msg: string, data?: unknown) => this.info(category, msg, data),
      warn: (msg: string, data?: unknown) => this.warn(category, msg, data),
      error: (msg: string, data?: unknown) => this.error(category, msg, data),
      logOnce: (level: LogLevel, msg: string, key?: string) => this.logOnce(level, category, msg, key),
    };
  }
}

/** Singleton logger instance */
const logger = new Logger();
export default logger;
