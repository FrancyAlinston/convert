import type { FileFormat } from "./FormatHandler.js";

declare global {
  interface Window {
    supportedFormatCache: Map<string, FileFormat[]>;
    printSupportedFormatCache: () => string;
    showPopup: (html: string) => void;
    hidePopup: () => void;
    cancelConversion: () => void;
    showLogs: () => void;
    exportLogs: () => void;
  }
}

export { };
