import type { FileFormat, FileData, FormatHandler, ConvertPathNode } from "./FormatHandler.js";
import normalizeMimeType from "./normalizeMimeType.js";
import handlers from "./handlers";
import logger, { LogLevel } from "./logger.js";

const log = logger.scoped("Main");

/** Maximum file size in bytes (1GB) */
const MAX_FILE_SIZE = 1024 * 1024 * 1024;

/** Files currently selected for conversion */
let selectedFiles: File[] = [];

/** Flag to cancel in-progress conversion */
let conversionCancelled = false;
/**
 * Whether to use "simple" mode.
 * - In **simple** mode, the input/output lists are grouped by file format.
 * - In **advanced** mode, these lists are grouped by format handlers, which
 *   requires the user to manually select the tool that processes the output.
 */
let simpleMode: boolean = true;

/** Handlers that support conversion from any formats. */
const conversionsFromAnyInput: ConvertPathNode[] = handlers
.filter(h => h.supportAnyInput && h.supportedFormats)
.flatMap(h => h.supportedFormats!
  .filter(f => f.to)
  .map(f => ({ handler: h, format: f})))

const ui = {
  fileInput: document.querySelector("#file-input") as HTMLInputElement,
  fileSelectArea: document.querySelector("#file-area") as HTMLDivElement,
  convertButton: document.querySelector("#convert-button") as HTMLButtonElement,
  modeToggleButton: document.querySelector("#mode-button") as HTMLButtonElement,
  inputList: document.querySelector("#from-list") as HTMLDivElement,
  outputList: document.querySelector("#to-list") as HTMLDivElement,
  inputSearch: document.querySelector("#search-from") as HTMLInputElement,
  outputSearch: document.querySelector("#search-to") as HTMLInputElement,
  popupBox: document.querySelector("#popup") as HTMLDivElement,
  popupBackground: document.querySelector("#popup-bg") as HTMLDivElement
};

/**
 * Filters a list of butttons to exclude those not matching a substring.
 * @param list Button list (div) to filter.
 * @param string Substring for which to search.
 */
const filterButtonList = (list: HTMLDivElement, string: string) => {
  for (const button of Array.from(list.children)) {
    if (!(button instanceof HTMLButtonElement)) continue;
    const formatIndex = button.getAttribute("format-index");
    let hasExtension = false;
    if (formatIndex) {
      const format = allOptions[parseInt(formatIndex)];
      hasExtension = format?.format.extension.toLowerCase().includes(string);
    }
    const hasText = button.textContent.toLowerCase().includes(string);
    if (!hasExtension && !hasText) {
      button.style.display = "none";
    } else {
      button.style.display = "";
    }
  }
}

/**
 * Handles search box input by filtering its parent container.
 * @param event Input event from an {@link HTMLInputElement}
 */
const searchHandler = (event: Event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;

  const targetParentList = target.parentElement?.querySelector(".format-list");
  if (!(targetParentList instanceof HTMLDivElement)) return;

  const string = target.value.toLowerCase();
  filterButtonList(targetParentList, string);
};

// Assign search handler to both search boxes
ui.inputSearch.oninput = searchHandler;
ui.outputSearch.oninput = searchHandler;

// Map clicks in the file selection area to the file input element
ui.fileSelectArea.onclick = () => {
  ui.fileInput.click();
};
// Allow keyboard activation (Enter/Space) for the file area
ui.fileSelectArea.onkeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    ui.fileInput.click();
  }
};

/**
 * Validates and stores user selected files. Works for both manual
 * selection and file drag-and-drop.
 * @param event Either a file input element's "change" event,
 * or a "drop" event.
 */
const fileSelectHandler = (event: Event) => {

  let inputFiles;

  if (event instanceof DragEvent) {
    inputFiles = event.dataTransfer?.files;
    if (inputFiles) event.preventDefault();
  } else if (event instanceof ClipboardEvent) {
    inputFiles = event.clipboardData?.files;
  } else {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    inputFiles = target.files;
  }

  if (!inputFiles) return;
  const files = Array.from(inputFiles);
  if (files.length === 0) return;

  log.info(`File(s) selected: ${files.map(f => `${f.name} (${(f.size / 1024).toFixed(1)}KB, ${f.type || 'unknown type'})`).join(', ')}`);

  // Validate file sizes
  const oversizedFiles = files.filter(f => f.size > MAX_FILE_SIZE);
  if (oversizedFiles.length > 0) {
    const sizeInMB = (oversizedFiles[0].size / 1024 / 1024).toFixed(1);
    window.showPopup(`<h2>File Too Large</h2>
      <p>"${oversizedFiles[0].name}" is ${sizeInMB}MB.</p>
      <p>Maximum file size: ${MAX_FILE_SIZE / 1024 / 1024}MB</p>
      <button onclick="window.hidePopup()">OK</button>`);
    return;
  }

  if (files.some(c => c.type !== files[0].type)) {
    window.showPopup(`<h2>Format Mismatch</h2>
      <p>All input files must be of the same type.</p>
      <button onclick="window.hidePopup()">OK</button>`);
    return;
  }
  files.sort((a, b) => a.name === b.name ? 0 : (a.name < b.name ? -1 : 1));
  selectedFiles = files;

  ui.fileSelectArea.innerHTML = `<h2>
    ${files[0].name}
    ${files.length > 1 ? `<br>... and ${files.length - 1} more` : ""}
  </h2>`;

  // Common MIME type adjustments (to match "mime" library)
  let mimeType = normalizeMimeType(files[0].type);

  // Find a button matching the input MIME type.
  const buttonMimeType = Array.from(ui.inputList.children).find(button => {
    if (!(button instanceof HTMLButtonElement)) return false;
    return button.getAttribute("mime-type") === mimeType;
  });
  // Click button with matching MIME type.
  if (mimeType && buttonMimeType instanceof HTMLButtonElement) {
    buttonMimeType.click();
    ui.inputSearch.value = mimeType;
    filterButtonList(ui.inputList, ui.inputSearch.value);
    return;
  }

  // Fall back to matching format by file extension if MIME type wasn't found.
  const fileExtension = files[0].name.split(".").pop()?.toLowerCase();

  const buttonExtension = Array.from(ui.inputList.children).find(button => {
    if (!(button instanceof HTMLButtonElement)) return false;
    const formatIndex = button.getAttribute("format-index");
    if (!formatIndex) return;
    const format = allOptions[parseInt(formatIndex)];
    return format.format.extension.toLowerCase() === fileExtension;
  });
  if (buttonExtension instanceof HTMLButtonElement) {
    buttonExtension.click();
    ui.inputSearch.value = buttonExtension.getAttribute("mime-type") || "";
  } else {
    ui.inputSearch.value = fileExtension || "";
  }

  filterButtonList(ui.inputList, ui.inputSearch.value);

};

// Add the file selection handler to both the file input element and to
// the window as a drag-and-drop event, and to the clipboard paste event.
ui.fileInput.addEventListener("change", fileSelectHandler);
window.addEventListener("drop", (e) => {
  e.preventDefault();
  ui.fileSelectArea.classList.remove("drag-over");
  fileSelectHandler(e);
});
window.addEventListener("dragover", (e) => {
  e.preventDefault();
  ui.fileSelectArea.classList.add("drag-over");
});
window.addEventListener("dragleave", (e) => {
  // Only remove if leaving the window
  if (!e.relatedTarget) {
    ui.fileSelectArea.classList.remove("drag-over");
  }
});
window.addEventListener("paste", fileSelectHandler);

/**
 * Display an on-screen popup.
 * @param html HTML content of the popup box.
 */
window.showPopup = function (html: string) {
  ui.popupBox.innerHTML = html;
  ui.popupBox.style.display = "block";
  ui.popupBackground.style.display = "block";
}
/**
 * Hide the on-screen popup.
 */
window.hidePopup = function () {
  ui.popupBox.style.display = "none";
  ui.popupBackground.style.display = "none";
}

const allOptions: Array<{ format: FileFormat, handler: FormatHandler }> = [];

window.supportedFormatCache = new Map();

window.printSupportedFormatCache = () => {
  const entries = [];
  for (const entry of window.supportedFormatCache) {
    entries.push(entry);
  }
  return JSON.stringify(entries, null, 2);
}

async function buildOptionList () {

  allOptions.length = 0;
  ui.inputList.innerHTML = "";
  ui.outputList.innerHTML = "";

  for (const handler of handlers) {
    if (!window.supportedFormatCache.has(handler.name)) {
      console.warn(`Cache miss for formats of handler "${handler.name}".`);
      log.info(`Initializing handler "${handler.name}" (no cache)...`);
      try {
        await handler.init();
      } catch (error) {
        console.error(`Failed to initialize handler "${handler.name}":`, error);
        log.error(`Failed to initialize handler "${handler.name}"`, error);
        continue;
      }
      if (handler.supportedFormats) {
        window.supportedFormatCache.set(handler.name, handler.supportedFormats);
        console.info(`Updated supported format cache for "${handler.name}".`);
        log.info(`Cached ${handler.supportedFormats.length} formats for "${handler.name}"`);
      }
    }
    const supportedFormats = window.supportedFormatCache.get(handler.name);
    if (!supportedFormats) {
      console.warn(`Handler "${handler.name}" doesn't support any formats.`);
      log.warn(`Handler "${handler.name}" has no supported formats`);
      continue;
    }
    for (const format of supportedFormats) {

      if (!format.mime) continue;

      allOptions.push({ format, handler });

      // In simple mode, display each input/output format only once
      let addToInputs = true, addToOutputs = true;
      if (simpleMode) {
        addToInputs = !Array.from(ui.inputList.children).some(c => {
          const currFormat = allOptions[parseInt(c.getAttribute("format-index") || "")]?.format;
          return currFormat?.mime === format.mime && currFormat?.format === format.format;
        });
        addToOutputs = !Array.from(ui.outputList.children).some(c => {
          const currFormat = allOptions[parseInt(c.getAttribute("format-index") || "")]?.format;
          return currFormat?.mime === format.mime && currFormat?.format === format.format;
        });
        if ((!format.from || !addToInputs) && (!format.to || !addToOutputs)) continue;
      }

      const newOption = document.createElement("button");
      newOption.setAttribute("format-index", (allOptions.length - 1).toString());
      newOption.setAttribute("mime-type", format.mime);

      const formatDescriptor = format.format.toUpperCase();
      if (simpleMode) {
        // Hide any handler-specific information in simple mode
        const cleanName = format.name
          .split("(").join(")").split(")")
          .filter((_, i) => i % 2 === 0)
          .filter(c => c != "")
          .join(" ");
        newOption.appendChild(document.createTextNode(`${formatDescriptor} - ${cleanName} (${format.mime})`));
      } else {
        newOption.appendChild(document.createTextNode(`${formatDescriptor} - ${format.name} (${format.mime}) ${handler.name}`));
      }

      const clickHandler = (event: Event) => {
        if (!(event.target instanceof HTMLButtonElement)) return;
        const targetParent = event.target.parentElement;
        const previous = targetParent?.getElementsByClassName("selected")?.[0];
        if (previous) previous.className = "";
        event.target.className = "selected";
        const allSelected = document.getElementsByClassName("selected");
        if (allSelected.length === 2) {
          ui.convertButton.className = "";
        } else {
          ui.convertButton.className = "disabled";
        }
      };

      if (format.from && addToInputs) {
        const clone = newOption.cloneNode(true) as HTMLButtonElement;
        clone.onclick = clickHandler;
        ui.inputList.appendChild(clone);
      }
      if (format.to && addToOutputs) {
        const clone = newOption.cloneNode(true) as HTMLButtonElement;
        clone.onclick = clickHandler;
        ui.outputList.appendChild(clone);
      }

    }
  }

  filterButtonList(ui.inputList, ui.inputSearch.value);
  filterButtonList(ui.outputList, ui.outputSearch.value);

  window.hidePopup();

}

(async () => {
  try {
    const cacheJSON = await fetch("cache.json").then(r => r.json());
    window.supportedFormatCache = new Map(cacheJSON);
  } catch {
    console.warn(
      "Missing supported format precache.\n\n" +
      "Consider saving the output of printSupportedFormatCache() to cache.json."
    );
    log.warn("No cache.json found — handlers will initialize on demand");
  } finally {
    await buildOptionList();
    const formatCount = allOptions.length;
    console.log("Built initial format list.");
    log.info(`Ready — ${formatCount} format options loaded from ${handlers.length} handlers`);
    console.info(
      "%cℹ️ Browser-based conversions use software decoding.\n" +
      "Hardware acceleration warnings are normal and expected.",
      "color: #1C77FF; font-weight: bold;"
    );
  }
})();

ui.modeToggleButton.addEventListener("click", () => {
  simpleMode = !simpleMode;
  if (simpleMode) {
    ui.modeToggleButton.textContent = "Advanced mode";
    document.body.style.setProperty("--highlight-color", "#1C77FF");
  } else {
    ui.modeToggleButton.textContent = "Simple mode";
    document.body.style.setProperty("--highlight-color", "#FF6F1C");
  }
  buildOptionList();
});

const convertPathCache: Array<{
  files: FileData[],
  node: ConvertPathNode
}> = [];

async function attemptConvertPath (files: FileData[], path: ConvertPathNode[]) {

  ui.popupBox.innerHTML = `<h2>Finding conversion route...</h2>
    <p>Trying <b>${path.map(c => c.format.format).join(" → ")}</b>...</p>
    <div class="spinner"></div>
    <button class="cancel-btn" onclick="window.cancelConversion()">Cancel</button>`;

  const cacheLast = convertPathCache.at(-1);
  if (cacheLast) files = cacheLast.files;

  const start = cacheLast ? convertPathCache.length : 0;
  for (let i = start; i < path.length - 1; i ++) {
    // Check for cancellation
    if (conversionCancelled) {
      return null;
    }

    const handler = path[i + 1].handler;
    
    // Update progress
    const progress = Math.round(((i + 1) / (path.length - 1)) * 100);
    ui.popupBox.innerHTML = `<h2>Converting... ${progress}%</h2>
      <p>Step ${i + 1}/${path.length - 1}: <b>${path[i].format.format} → ${path[i + 1].format.format}</b></p>
      <progress value="${progress}" max="100"></progress>
      <div class="spinner"></div>
      <button class="cancel-btn" onclick="window.cancelConversion()">Cancel</button>`;
    
    try {
      let supportedFormats = window.supportedFormatCache.get(handler.name);
      if (!handler.ready) {
        log.debug(`Lazy-initializing handler "${handler.name}"`);
        try {
          await handler.init();
        } catch (_) { return null; }
        if (handler.supportedFormats) {
          window.supportedFormatCache.set(handler.name, handler.supportedFormats);
          supportedFormats = handler.supportedFormats;
        }
      }
      if (!supportedFormats) throw `Handler "${handler.name}" doesn't support any formats.`;
      const inputFormat = supportedFormats.find(c => c.mime === path[i].format.mime && c.from)!;
      
      log.debug(`Converting step ${i + 1}: ${path[i].format.format} → ${path[i + 1].format.format} [${handler.name}]`);
      const stepStart = performance.now();
      
      files = await handler.doConvert(files, inputFormat, path[i + 1].format);
      
      const stepTime = ((performance.now() - stepStart) / 1000).toFixed(2);
      log.info(`Step ${i + 1} completed in ${stepTime}s: ${path[i].format.format} → ${path[i + 1].format.format} (${files.length} file(s), ${files.reduce((s, f) => s + f.bytes.length, 0)} bytes)`);
      
      if (files.some(c => !c.bytes.length)) throw "Output is empty.";
      convertPathCache.push({ files, node: path[i + 1] });
    } catch (e) {
      // Log all conversion errors with context
      const errorMsg = String(e);
      const pathStr = path.map(c => c.format.format).join(" → ");
      
      log.error(`Conversion failed at step ${i + 1}: ${path[i].format.format} → ${path[i + 1].format.format}`, {
        handler: handler.name,
        path: pathStr,
        error: errorMsg,
      });
      
      // Only log verbose errors to console for non-common issues
      if (!errorMsg.includes("FS error") && !errorMsg.includes("hardware accelerated")) {
        console.log(path.map(c => c.format.format));
        console.error(handler.name, `${path[i].format.format} → ${path[i + 1].format.format}`, e);
      }
      
      return null;
    }
  }

  return { files, path };

}

async function buildConvertPath (
  files: FileData[],
  target: ConvertPathNode,
  queue: ConvertPathNode[][]
) {

  convertPathCache.length = 0;

  let isNestedConversion: boolean = false;

  while (queue.length > 0) {
    const path = queue.shift();
    if (!path) continue;
    if (path.length > 5) continue;

    for (let i = 1; i < path.length; i ++) {
      if (path[i] !== convertPathCache[i]?.node) {
        convertPathCache.length = i - 1;
        break;
      }
    }

    const previous = path[path.length - 1];

    // Get handlers that support *taking in* the previous node's format
    const validHandlers = handlers.filter(handler => (
      window.supportedFormatCache.get(handler.name)?.some(format => (
        format.mime === previous.format.mime &&
        format.from
      ))
    ));

    if (simpleMode) {
      // Try *all* supported handlers that output the target format
      const candidates = allOptions.filter(opt =>
        validHandlers.includes(opt.handler) &&
        opt.format.mime === target.format.mime && opt.format.to
      );
      for (const candidate of candidates) {
        const attempt = await attemptConvertPath(files, path.concat(candidate));
        if (attempt) return attempt;
      }
    } else {
      // Check if the target handler is supported by the previous node
      if (validHandlers.includes(target.handler)) {
        const attempt = await attemptConvertPath(files, path.concat(target));
        if (attempt) return attempt;
      }
    }

    // Look for conversions from any input format.
    // Checked only if there is no direct conversion between the requested formats.
    if (!isNestedConversion) {
      const anyConversions = conversionsFromAnyInput.filter(c => c.format.mime == target.format.mime);

      for (const conversion of anyConversions) {
        const attempt = await attemptConvertPath(files, path.concat(conversion));
        if (attempt) return attempt; 
      }

      isNestedConversion = true;
    }

    // Look for untested mime types among valid handlers and add to queue
    for (const handler of validHandlers) {
      const supportedFormats = window.supportedFormatCache.get(handler.name);
      if (!supportedFormats) continue;
      for (const format of supportedFormats) {
        if (!format.to) continue;
        if (!format.mime) continue;
        // Prevent cycles by comparing format properties, not object references
        if (path.some(c => c.format.mime === format.mime && c.format.format === format.format)) continue;
        queue.push(path.concat({ format, handler }));
      }
    }
  }

  return null;

}

function downloadFile (bytes: Uint8Array, name: string, mime: string) {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = name;
  link.click();
  
  // Cleanup to prevent memory leaks
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

// Cancel conversion handler
window.cancelConversion = function () {
  conversionCancelled = true;
  log.warn('Conversion cancelled by user');
  window.showPopup(`<h2>Conversion Cancelled</h2>
    <p>The conversion was stopped.</p>
    <button onclick="window.hidePopup()">OK</button>`);
};

ui.convertButton.onclick = async function () {

  const inputFiles = selectedFiles;

  if (inputFiles.length === 0) {
    window.showPopup(`<h2>No File Selected</h2><p>Please select an input file first.</p>
      <button onclick="window.hidePopup()">OK</button>`);
    return;
  }

  const inputButton = document.querySelector("#from-list .selected");
  if (!inputButton) {
    window.showPopup(`<h2>No Input Format</h2><p>Please specify the input file format.</p>
      <button onclick="window.hidePopup()">OK</button>`);
    return;
  }

  const outputButton = document.querySelector("#to-list .selected");
  if (!outputButton) {
    window.showPopup(`<h2>No Output Format</h2><p>Please specify the output file format.</p>
      <button onclick="window.hidePopup()">OK</button>`);
    return;
  }

  const inputOption = allOptions[Number(inputButton.getAttribute("format-index"))];
  const outputOption = allOptions[Number(outputButton.getAttribute("format-index"))];

  const inputFormat = inputOption.format;
  const outputFormat = outputOption.format;
  
  log.info(`Starting conversion: ${inputFormat.format} (${inputFormat.mime}) → ${outputFormat.format} (${outputFormat.mime})`, {
    inputFiles: inputFiles.length,
    totalSize: inputFiles.reduce((s, f) => s + f.size, 0),
    inputHandler: inputOption.handler.name,
    outputHandler: outputOption.handler.name,
  });
  
  // Reset cancellation flag
  conversionCancelled = false;
  const startTime = performance.now();

  try {

    const inputFileData = [];
    for (const inputFile of inputFiles) {
      const inputBuffer = await inputFile.arrayBuffer();
      const inputBytes = new Uint8Array(inputBuffer);
      if (inputFormat.mime === outputFormat.mime) {
        downloadFile(inputBytes, inputFile.name, inputFormat.mime);
        continue;
      }
      inputFileData.push({ name: inputFile.name, bytes: inputBytes });
    }

    window.showPopup("<h2>Finding conversion route...</h2><div class=\"spinner\"></div>");

    const output = await buildConvertPath(inputFileData, outputOption, [[inputOption]]);
    
    if (conversionCancelled) return;
    
    if (!output) {
      log.error(`No conversion route found: ${inputFormat.format} → ${outputFormat.format}`);
      window.showPopup(`<h2>Conversion Failed</h2>
        <p>Could not find a conversion route from <b>${inputFormat.format}</b> to <b>${outputFormat.format}</b>.</p>
        <button onclick="window.hidePopup()">OK</button>`);
      return;
    }

    for (const file of output.files) {
      downloadFile(file.bytes, file.name, outputFormat.mime);
    }

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);

    log.info(`Conversion complete in ${elapsed}s: ${output.path.map(c => c.format.format).join(' → ')}`, {
      outputFiles: output.files.length,
      outputSize: output.files.reduce((s, f) => s + f.bytes.length, 0),
      duration: elapsed,
    });

    // Save to conversion history
    try {
      const history = JSON.parse(localStorage.getItem('conversion-history') || '[]');
      history.unshift({
        timestamp: Date.now(),
        from: inputOption.format.format,
        fromMime: inputFormat.mime,
        to: outputOption.format.format,
        toMime: outputFormat.mime,
        files: output.files.length,
        path: output.path.map(c => c.format.format).join(' \u2192 '),
        duration: elapsed
      });
      // Keep only last 50 conversions
      localStorage.setItem('conversion-history', JSON.stringify(history.slice(0, 50)));
    } catch (error) {
      log.warn('Failed to save conversion history', error);
      console.warn('Failed to save conversion history:', error);
    }

    window.showPopup(
      `<h2>Converted ${inputOption.format.format.toUpperCase()} to ${outputOption.format.format.toUpperCase()}!</h2>` +
      `<p>Path: <b>${output.path.map(c => c.format.format).join(" \u2192 ")}</b></p>` +
      `<p class="conversion-time">Completed in ${elapsed}s</p>` +
      `<button onclick="window.hidePopup()">OK</button>`
    );

  } catch (e) {

    log.error('Unexpected conversion error', e);
    window.showPopup(`<h2>Conversion Error</h2>
      <p>An unexpected error occurred:</p>
      <p><code>${String(e).slice(0, 200)}</code></p>
      <button onclick="window.hidePopup()">OK</button>`);
    console.error(e);

  }

};
// Keyboard shortcuts
document.addEventListener('keydown', (event) => {
  // Ctrl/Cmd + V to paste file
  if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
    navigator.clipboard.read().then(items => {
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/') || type.startsWith('video/')) {
            item.getType(type).then(blob => {
              const file = new File([blob], 'pasted-file', { type });
              selectedFiles = [file];
              ui.fileSelectArea.innerHTML = `<h2>${file.name}</h2>`;
            });
            break;
          }
        }
      }
    }).catch(() => {
      // Clipboard API not available or permission denied
    });
  }
  
  // Enter to convert (if both formats selected)
  if (event.key === 'Enter' && ui.convertButton.className !== 'disabled') {
    ui.convertButton.click();
  }
  
  // Escape to close popup
  if (event.key === 'Escape') {
    window.hidePopup();
  }
  
  // Ctrl+Shift+L to open log viewer
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'L') {
    event.preventDefault();
    window.showLogs();
  }
});

// Add function to view conversion history
(window as typeof window & { showConversionHistory: () => void }).showConversionHistory = () => {
  try {
    const history = JSON.parse(localStorage.getItem('conversion-history') || '[]');
    if (history.length === 0) {
      window.showPopup('<h2>Conversion History</h2><p>No conversions yet.</p><button onclick=\"window.hidePopup()\">OK</button>');
      return;
    }
    
    const historyHTML = history.slice(0, 10).map((item: {
      timestamp: number;
      from: string;
      to: string;
      files: number;
      path: string;
    }) => {
      const date = new Date(item.timestamp).toLocaleString();
      return `<li><b>${item.from} → ${item.to}</b> (${item.files} file${item.files > 1 ? 's' : ''})<br><small>${date}</small></li>`;
    }).join('');
    
    window.showPopup(
      `<h2>Recent Conversions</h2><ul style="text-align: left; max-height: 400px; overflow-y: auto;">${historyHTML}</ul>` +
      `<button onclick="window.hidePopup()">OK</button>`
    );
  } catch (error) {
    console.error('Failed to load conversion history:', error);
  }
};

// ====== Log Viewer ======

const LOG_LEVEL_BADGE: Record<number, { label: string; color: string; bg: string }> = {
  0: { label: "DBG", color: "#666", bg: "#eee" },
  1: { label: "INF", color: "#1C77FF", bg: "#e6f0ff" },
  2: { label: "WRN", color: "#956a00", bg: "#fff3cd" },
  3: { label: "ERR", color: "#c0392b", bg: "#fde8e8" },
};

window.showLogs = function () {
  const entries = logger.getEntries();
  
  const logRows = entries.map(e => {
    const time = new Date(e.timestamp).toLocaleTimeString("en-US", { hour12: false, fractionalSecondDigits: 3 });
    const badge = LOG_LEVEL_BADGE[e.level] || LOG_LEVEL_BADGE[0];
    const dataStr = e.data !== undefined
      ? `<pre style="margin:2px 0 0;font-size:0.75rem;color:#888;overflow-x:auto;max-width:100%">${
          typeof e.data === 'string' ? e.data : JSON.stringify(e.data, null, 1)
        }</pre>`
      : "";
    return `<tr style="border-bottom:1px solid #eee">
      <td style="padding:4px 6px;font-size:0.75rem;color:#888;white-space:nowrap;vertical-align:top">${time}</td>
      <td style="padding:4px 6px;vertical-align:top"><span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:0.7rem;font-weight:bold;color:${badge.color};background:${badge.bg}">${badge.label}</span></td>
      <td style="padding:4px 6px;font-size:0.8rem;font-weight:bold;color:#555;white-space:nowrap;vertical-align:top">${e.category}</td>
      <td style="padding:4px 6px;font-size:0.8rem;vertical-align:top">${e.message}${dataStr}</td>
    </tr>`;
  }).join("");

  const html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <h2 style="margin:0">Debug Log</h2>
      <span style="font-size:0.8rem;color:#888">${entries.length} entries</span>
    </div>
    <div style="max-height:50vh;overflow-y:auto;text-align:left;border:1px solid #ddd;border-radius:6px">
      <table style="width:100%;border-collapse:collapse;font-family:monospace">
        <thead><tr style="background:#f5f5f5;position:sticky;top:0">
          <th style="padding:6px;text-align:left;font-size:0.75rem">Time</th>
          <th style="padding:6px;text-align:left;font-size:0.75rem">Level</th>
          <th style="padding:6px;text-align:left;font-size:0.75rem">Source</th>
          <th style="padding:6px;text-align:left;font-size:0.75rem">Message</th>
        </tr></thead>
        <tbody>${logRows || '<tr><td colspan="4" style="padding:20px;text-align:center;color:#888">No log entries yet</td></tr>'}</tbody>
      </table>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:center">
      <button onclick="window.exportLogs()">Export Logs</button>
      <button onclick="window.hidePopup()">Close</button>
    </div>
    <p style="font-size:0.75rem;color:#888;margin-top:8px">Shortcut: Ctrl+Shift+L</p>
  `;

  window.showPopup(html);
  
  // Make the popup wider for the log viewer
  ui.popupBox.style.width = "clamp(400px, 70vw, 900px)";
  // Restore default width when closed
  const origHide = window.hidePopup;
  window.hidePopup = function () {
    ui.popupBox.style.width = "";
    window.hidePopup = origHide;
    origHide();
  };
};

window.exportLogs = function () {
  const logData = logger.export();
  const blob = new Blob([logData], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `convert-logs-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
  log.info("Logs exported to file");
};