import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

import { FFmpeg } from "@ffmpeg/ffmpeg";
import type { LogEvent } from "@ffmpeg/ffmpeg";

import mime from "mime";
import normalizeMimeType from "../normalizeMimeType.ts";

class FFmpegHandler implements FormatHandler {

  public name: string = "FFmpeg";
  public supportedFormats: FileFormat[] = [];
  public ready: boolean = false;

  #ffmpeg?: FFmpeg;
  #suppressedWarnings = new Set<string>();
  #warningCount = new Map<string, number>();

  #stdout: string = "";
  handleStdout (log: LogEvent) {
    this.#stdout += log.message + "\n";
  }
  
  /**
   * Filter out repetitive warning messages to reduce console spam.
   * @param log Log event from FFmpeg
   */
  handleFilteredLog (log: LogEvent) {
    const msg = log.message;
    
    // Suppress hardware acceleration warnings (these are expected in browser)
    if (msg.includes("hardware accelerated") || msg.includes("suppport hardware")) {
      const key = msg.trim();
      const count = this.#warningCount.get(key) || 0;
      
      // Only log the first occurrence
      if (count === 0) {
        console.warn("[FFmpeg] Hardware acceleration not available (browser limitation - using software decoding)");
        this.#warningCount.set(key, 1);
      }
      return; // Don't log to console
    }
    
    // Suppress FS error spam
    if (msg.includes("FS error")) {
      const key = "FS error";
      const count = this.#warningCount.get(key) || 0;
      if (count === 0) {
        console.warn("[FFmpeg] File system errors detected (may affect some conversions)");
        this.#warningCount.set(key, 1);
      }
      return;
    }
    
    // Log everything else normally
    if (log.type === 'fferr') {
      console.error("[FFmpeg]", msg);
    } else if (msg.trim()) {
      // Only log non-empty messages
      console.log("[FFmpeg]", msg);
    }
  }
  clearStdout () {
    this.#stdout = "";
  }
  async getStdout (callback: () => void | Promise<void>) {
    if (!this.#ffmpeg) return "";
    this.clearStdout();
    this.#ffmpeg.on("log", this.handleStdout.bind(this));
    await callback();
    this.#ffmpeg.off("log", this.handleStdout.bind(this));
    return this.#stdout;
  }

  async loadFFmpeg () {
    if (!this.#ffmpeg) return;
    return await this.#ffmpeg.load({
      coreURL: "/convert/wasm/ffmpeg-core.js"
    });
  }
  terminateFFmpeg () {
    if (!this.#ffmpeg) return;
    this.#ffmpeg.terminate();
  }
  async reloadFFmpeg () {
    if (!this.#ffmpeg) return;
    this.terminateFFmpeg();
    await this.loadFFmpeg();
  }
  /**
   * FFmpeg tends to run out of memory (?) with an "index out of bounds"
   * message sometimes. Other times it just stalls, irrespective of any timeout.
   *
   * This wrapper restarts FFmpeg when it crashes with that OOB error, and
   * forces a Promise-level timeout as a fallback for when it stalls.
   * @param args CLI arguments, same as in `FFmpeg.exec()`.
   * @param timeout Max execution time in milliseconds. `-1` for no timeout (default).
   * @param attempts Amount of times to attempt execution. Default is 1.
   */
  async execSafe (args: string[], timeout: number = -1, attempts: number = 1): Promise<void> {
    if (!this.#ffmpeg) throw "Handler not initialized.";
    try {
      if (timeout === -1) {
        await this.#ffmpeg.exec(args);
      } else {
        await Promise.race([
          this.#ffmpeg.exec(args, timeout),
          new Promise((_, reject) => setTimeout(reject, timeout))
        ]);
      }
    } catch (e) {
      if (!e || (
        typeof e === "string"
        && e.includes("out of bounds")
        && attempts > 1
      )) {
        await this.reloadFFmpeg();
        return await this.execSafe(args, timeout, attempts - 1);
      }
      console.error(e);
      throw e;
    }
  }

  async init () {

    this.#ffmpeg = new FFmpeg();
    
    // Set up filtered logging to reduce console spam
    this.#ffmpeg.on("log", this.handleFilteredLog.bind(this));
    
    await this.loadFFmpeg();

    const getMuxerDetails = async (muxer: string) => {

      const stdout = await this.getStdout(async () => {
        await this.execSafe(["-hide_banner", "-h", "muxer=" + muxer], 3000, 5);
      });

      return {
        extension: stdout.split("Common extensions: ")[1].split(".")[0].split(",")[0],
        mimeType: stdout.split("Mime type: ")[1].split("\n")[0].split(".").slice(0, -1).join(".")
      };
    }

    const stdout = await this.getStdout(async () => {
      await this.execSafe(["-formats", "-hide_banner"], 3000, 5);
    });
    const lines = stdout.split(" --\n")[1].split("\n");

    for (let line of lines) {

      let len;
      do {
        len = line.length;
        line = line.replaceAll("  ", " ");
      } while (len !== line.length);
      line = line.trim();

      const parts = line.split(" ");
      if (parts.length < 2) continue;

      const flags = parts[0];
      const description = parts.slice(2).join(" ");
      const formats = parts[1].split(",");

      if (description.startsWith("piped ")) continue;

      for (const format of formats) {

        let primaryFormat = formats[0];
        if (primaryFormat === "png") primaryFormat = "apng";

        let extension, mimeType;
        try {
          const details = await getMuxerDetails(primaryFormat);
          extension = details.extension;
          mimeType = details.mimeType;
        } catch (e) {
          extension = format;
          mimeType = mime.getType(format) || ("video/" + format);
        }
        mimeType = normalizeMimeType(mimeType);

        this.supportedFormats.push({
          name: description + (formats.length > 1 ? (" / " + format) : ""),
          format,
          extension,
          mime: mimeType,
          from: flags.includes("D"),
          to: flags.includes("E"),
          internal: format
        });

      }

    }

    // ====== Manual fine-tuning ======

    const prioritize = ["webm", "mp4", "gif"];
    prioritize.reverse();

    this.supportedFormats.sort((a, b) => {
      const priorityIndexA = prioritize.indexOf(a.format);
      const priorityIndexB = prioritize.indexOf(b.format);
      return priorityIndexB - priorityIndexA;
    });

    // AV1 doesn't seem to be included in WASM FFmpeg
    this.supportedFormats.splice(this.supportedFormats.findIndex(c => c.mime === "image/avif"), 1);

    this.#ffmpeg.terminate();

    this.ready = true;
  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
    args?: string[]
  ): Promise<FileData[]> {

    if (!this.#ffmpeg) {
      throw "Handler not initialized.";
    }

    await this.reloadFFmpeg();

    let forceFPS = 0;
    if (inputFormat.mime === "image/png" || inputFormat.mime === "image/jpeg") {
      forceFPS = inputFiles.length < 30 ? 1 : 30;
    }

    let fileIndex = 0;
    let listString = "";
    for (const file of inputFiles) {
      const entryName = `file_${fileIndex++}.${inputFormat.extension}`;
      await this.#ffmpeg.writeFile(entryName, new Uint8Array(file.bytes));
      listString += `file '${entryName}'\n`;
      if (forceFPS) listString += `duration ${1 / forceFPS}\n`;
    }
    await this.#ffmpeg.writeFile("list.txt", new TextEncoder().encode(listString));

    const command = ["-hide_banner", "-f", "concat", "-safe", "0", "-i", "list.txt", "-f", outputFormat.internal];
    if (outputFormat.mime === "video/mp4") {
      command.push("-pix_fmt", "yuv420p");
    }
    if (args) command.push(...args);
    command.push("output");

    const stdout = await this.getStdout(async () => {
      await this.#ffmpeg!.exec(command);
    });

    for (let i = 0; i < fileIndex; i ++) {
      const entryName = `file_${i}.${inputFormat.extension}`;
      await this.#ffmpeg.deleteFile(entryName);
    }

    if (stdout.includes("Conversion failed!\n")) {

      if (!args) {
        if (stdout.includes("Valid sizes are")) {
          const newSize = stdout.split("Valid sizes are ")[1].split(".")[0].split(" ").pop();
          if (typeof newSize !== "string") throw stdout;
          return this.doConvert(inputFiles, inputFormat, outputFormat, ["-s", newSize]);
        }
      }

      throw stdout;
    }

    let bytes: Uint8Array;

    const fileData = await this.#ffmpeg.readFile("output");
    if (!(fileData instanceof Uint8Array)) {
      const encoder = new TextEncoder();
      bytes = encoder.encode(fileData);
    } else {
      bytes = new Uint8Array(fileData?.buffer);
    }

    await this.#ffmpeg.deleteFile("output");
    await this.#ffmpeg.deleteFile("list.txt");

    const baseName = inputFiles[0].name.split(".")[0];
    const name = baseName + "." + outputFormat.extension;

    return [{ bytes, name }];

  }

}

export default FFmpegHandler;
