import type { FileFormat, FileData, FormatHandler, ConvertPathNode } from "./FormatHandler.js";
import JSZip from "jszip";
import normalizeMimeType from "./normalizeMimeType.js";
import handlers from "./handlers";

/** Files currently selected for conversion */
let selectedFiles: File[] = [];
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

  if (files.some(c => c.type !== files[0].type)) {
    return alert("All input files must be of the same type.");
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
window.addEventListener("drop", fileSelectHandler);
window.addEventListener("dragover", e => e.preventDefault());
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

type DownloadEntry = {
  bytes: Uint8Array;
  name: string;
  mime: string;
};

const pendingDownloads: DownloadEntry[] = [];
const downloadedIndexes = new Set<number>();
let pendingDownloadZipName = "converted_files.zip";

const conversionProgress = {
  finishedInputs: 0,
  totalInputs: 0,
  generatedOutputs: 0,
  failedInputs: 0
};

function escapeHTML (value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sanitizeFilenamePart (value: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
  return sanitized || "files";
}

function shouldConvertEachInput (
  inputFormat: FileFormat,
  outputFormat: FileFormat,
  inputCount: number
): boolean {
  if (inputCount <= 1) return false;
  if (inputFormat.mime === outputFormat.mime) return false;
  if (outputFormat.mime === "application/zip") return false;
  if (outputFormat.mime.startsWith("audio/")) return false;
  if (outputFormat.mime.startsWith("video/")) return false;
  return true;
}

function renderConversionProgress (title: string, details: string) {
  const percent = conversionProgress.totalInputs > 0
    ? Math.floor((conversionProgress.finishedInputs / conversionProgress.totalInputs) * 100)
    : 100;

  const failedLine = conversionProgress.failedInputs > 0
    ? `<p>Failed <b>${conversionProgress.failedInputs}</b> input files so far.</p>`
    : "";

  window.showPopup(
    `<h2>${escapeHTML(title)}</h2>` +
    `<p>Finished <b>${conversionProgress.finishedInputs}</b> / <b>${conversionProgress.totalInputs}</b> input files (${percent}%).</p>` +
    `<p>Generated <b>${conversionProgress.generatedOutputs}</b> output files so far.</p>` +
    failedLine +
    `<p>${escapeHTML(details)}</p>`
  );
}

function showDownloadPopup (
  inputLabel: string,
  outputLabel: string,
  routeLabels: string[],
  failedInputs: number
) {
  const title = failedInputs > 0
    ? `Conversion finished: ${escapeHTML(inputLabel)} to ${escapeHTML(outputLabel)}`
    : `Converted ${escapeHTML(inputLabel)} to ${escapeHTML(outputLabel)}!`;

  const routeSummary = routeLabels.length === 1
    ? `<p>Path used: <b>${escapeHTML(routeLabels[0])}</b>.</p>`
    : `<p>Paths used: <b>${routeLabels.length}</b> routes (varies by input file).</p>`;

  const failedSummary = failedInputs > 0
    ? `<p>Failed input files: <b>${failedInputs}</b>.</p>`
    : "";

  const listHTML = pendingDownloads.length > 0
    ? pendingDownloads.map((file, index) => (
      `<div class="popup-download-row">` +
      `<span class="popup-download-name">${escapeHTML(file.name)}</span>` +
      `<button id="download-result-${index}" onclick="window.downloadConvertedFile(${index})">Download</button>` +
      `</div>`
    )).join("")
    : `<p>No output files were generated.</p>`;

  const actionsHTML = pendingDownloads.length > 0
    ? `<button id="download-all-zip" onclick="window.downloadAllConvertedAsZip()">Download all as ZIP</button>` +
      `<button onclick="window.hidePopup()">Close</button>`
    : `<button onclick="window.hidePopup()">Close</button>`;

  window.showPopup(
    `<h2>${title}</h2>` +
    `<p>Finished input files: <b>${conversionProgress.finishedInputs}</b> / <b>${conversionProgress.totalInputs}</b>.</p>` +
    `<p>Output files: <b>${pendingDownloads.length}</b>. Downloaded individually: <b id="downloaded-count">0</b> / <b>${pendingDownloads.length}</b>.</p>` +
    failedSummary +
    routeSummary +
    `<div class="popup-download-list">${listHTML}</div>` +
    `<div class="popup-actions">${actionsHTML}</div>`
  );
}

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
      try {
        await handler.init();
      } catch (_) { continue; }
      if (handler.supportedFormats) {
        window.supportedFormatCache.set(handler.name, handler.supportedFormats);
        console.info(`Updated supported format cache for "${handler.name}".`);
      }
    }
    const supportedFormats = window.supportedFormatCache.get(handler.name);
    if (!supportedFormats) {
      console.warn(`Handler "${handler.name}" doesn't support any formats.`);
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
  } finally {
    await buildOptionList();
    console.log("Built initial format list.");
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

  const route = path.map(c => c.format.format).join(" -> ");
  renderConversionProgress("Converting files...", `Trying route: ${route}`);

  const cacheLast = convertPathCache.at(-1);
  if (cacheLast) files = cacheLast.files;

  const start = cacheLast ? convertPathCache.length : 0;
  for (let i = start; i < path.length - 1; i ++) {
    const handler = path[i + 1].handler;
    try {
      let supportedFormats = window.supportedFormatCache.get(handler.name);
      if (!handler.ready) {
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
      files = await handler.doConvert(files, inputFormat, path[i + 1].format);
      if (files.some(c => !c.bytes.length)) throw "Output is empty.";
      convertPathCache.push({ files, node: path[i + 1] });
    } catch (e) {
      console.log(path.map(c => c.format.format));
      console.error(handler.name, `${path[i].format.format} → ${path[i + 1].format.format}`, e);
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
        if (path.some(c => c.format === format)) continue;
        queue.push(path.concat({ format, handler }));
      }
    }
  }

  return null;

}

function downloadFile (bytes: Uint8Array, name: string, mime: string) {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
}

function updateDownloadedCounter () {
  const counter = document.querySelector("#downloaded-count");
  if (counter instanceof HTMLElement) {
    counter.textContent = downloadedIndexes.size.toString();
  }
}

window.downloadConvertedFile = function (index: number) {
  if (downloadedIndexes.has(index)) return;
  const entry = pendingDownloads[index];
  if (!entry) return;

  downloadFile(entry.bytes, entry.name, entry.mime);
  downloadedIndexes.add(index);

  const button = document.querySelector(`#download-result-${index}`);
  if (button instanceof HTMLButtonElement) {
    button.textContent = "Downloaded";
    button.disabled = true;
  }

  updateDownloadedCounter();
}

window.downloadAllConvertedAsZip = async function () {
  if (pendingDownloads.length === 0) return;

  const button = document.querySelector("#download-all-zip");
  if (!(button instanceof HTMLButtonElement)) return;

  const defaultText = "Download all as ZIP";
  button.disabled = true;
  button.textContent = "Building ZIP...";

  try {
    const zip = new JSZip();
    for (const file of pendingDownloads) {
      zip.file(file.name, file.bytes);
    }
    const bytes = await zip.generateAsync({ type: "uint8array" });
    downloadFile(bytes, pendingDownloadZipName, "application/zip");
    button.textContent = "ZIP downloaded";
  } catch (e) {
    console.error(e);
    alert("Failed to create ZIP archive.");
    button.textContent = defaultText;
    button.disabled = false;
    return;
  }

  setTimeout(() => {
    button.textContent = defaultText;
    button.disabled = false;
  }, 1000);
}

ui.convertButton.onclick = async function () {

  const inputFiles = selectedFiles;

  if (inputFiles.length === 0) {
    return alert("Select an input file.");
  }

  const inputButton = document.querySelector("#from-list .selected");
  if (!inputButton) return alert("Specify input file format.");

  const outputButton = document.querySelector("#to-list .selected");
  if (!outputButton) return alert("Specify output file format.");

  const inputOption = allOptions[Number(inputButton.getAttribute("format-index"))];
  const outputOption = allOptions[Number(outputButton.getAttribute("format-index"))];

  const inputFormat = inputOption.format;
  const outputFormat = outputOption.format;

  try {

    pendingDownloads.length = 0;
    downloadedIndexes.clear();

    conversionProgress.finishedInputs = 0;
    conversionProgress.totalInputs = inputFiles.length;
    conversionProgress.generatedOutputs = 0;
    conversionProgress.failedInputs = 0;

    const inputFileData: FileData[] = [];
    for (let i = 0; i < inputFiles.length; i ++) {
      const inputFile = inputFiles[i];
      const inputBuffer = await inputFile.arrayBuffer();
      const inputBytes = new Uint8Array(inputBuffer);
      inputFileData.push({ name: inputFile.name, bytes: inputBytes });

      window.showPopup(
        `<h2>Preparing files...</h2>` +
        `<p>Loaded <b>${i + 1}</b> / <b>${inputFiles.length}</b> input files.</p>` +
        `<p>Finished <b>${conversionProgress.finishedInputs}</b> / <b>${conversionProgress.totalInputs}</b> input files.</p>`
      );
    }

    conversionProgress.totalInputs = inputFileData.length;
    pendingDownloadZipName = `converted-${sanitizeFilenamePart(inputOption.format.format)}-to-${sanitizeFilenamePart(outputOption.format.format)}.zip`;

    const routeLabels = new Set<string>();
    const convertEachInput = shouldConvertEachInput(inputFormat, outputFormat, inputFileData.length);

    renderConversionProgress(
      "Converting files...",
      convertEachInput
        ? "Converting each input file separately."
        : "Starting conversion."
    );

    if (inputFormat.mime === outputFormat.mime) {
      for (const file of inputFileData) {
        pendingDownloads.push({
          bytes: file.bytes,
          name: file.name,
          mime: inputFormat.mime
        });
      }
      conversionProgress.finishedInputs = conversionProgress.totalInputs;
      conversionProgress.generatedOutputs = pendingDownloads.length;
      routeLabels.add("No conversion needed (same format)");
    } else if (convertEachInput) {
      for (let i = 0; i < inputFileData.length; i ++) {
        const file = inputFileData[i];
        renderConversionProgress(
          "Converting files...",
          `Converting ${file.name} (${i + 1}/${inputFileData.length}).`
        );

        const output = await buildConvertPath([file], outputOption, [[inputOption]]);
        conversionProgress.finishedInputs = i + 1;

        if (!output) {
          conversionProgress.failedInputs += 1;
          continue;
        }

        routeLabels.add(output.path.map(c => c.format.format).join(" -> "));

        for (const outputFile of output.files) {
          pendingDownloads.push({
            bytes: outputFile.bytes,
            name: outputFile.name,
            mime: outputFormat.mime
          });
        }

        conversionProgress.generatedOutputs = pendingDownloads.length;
      }

      if (pendingDownloads.length === 0) {
        window.hidePopup();
        alert("Failed to convert all input files.");
        return;
      }
    } else {
      const output = await buildConvertPath(inputFileData, outputOption, [[inputOption]]);
      if (!output) {
        window.hidePopup();
        alert("Failed to find conversion route.");
        return;
      }

      routeLabels.add(output.path.map(c => c.format.format).join(" -> "));

      for (const file of output.files) {
        pendingDownloads.push({
          bytes: file.bytes,
          name: file.name,
          mime: outputFormat.mime
        });
      }

      conversionProgress.finishedInputs = conversionProgress.totalInputs;
      conversionProgress.generatedOutputs = pendingDownloads.length;
    }

    if (conversionProgress.finishedInputs < conversionProgress.totalInputs) {
      conversionProgress.finishedInputs = conversionProgress.totalInputs;
    }
    conversionProgress.generatedOutputs = pendingDownloads.length;
    renderConversionProgress("Finalizing results...", "Sorting output files.");

    pendingDownloads.sort((a, b) => (
      a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: "base"
      })
    ));

    showDownloadPopup(
      inputOption.format.format,
      outputOption.format.format,
      Array.from(routeLabels),
      conversionProgress.failedInputs
    );

  } catch (e) {

    window.hidePopup();
    alert("Unexpected error while routing:\n" + e);
    console.error(e);

  }

};
