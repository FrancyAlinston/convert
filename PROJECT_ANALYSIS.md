# Convert.to.it - Complete Project Analysis

## 🎯 Project Overview

**Convert.to.it** is a revolutionary, privacy-first, truly universal online file converter that runs entirely in the browser. Unlike traditional converters that upload files to servers and only support format pairs within the same medium (images↔images, videos↔videos), this tool can convert between virtually **any** file formats.

**Website:** [https://convert.to.it/](https://convert.to.it)  
**License:** GPL-2.0  
**Repository:** github.com/p2r3/convert  
**Current Branch:** Beta  

---

## 📊 Project Statistics

| Metric | Value |
|--------|-------|
| **Primary Language** | TypeScript |
| **Framework** | Vite + TypeScript |
| **Runtime** | Browser (ES2022) |
| **Build Tool** | Vite |
| **Package Manager** | Bun (primary), npm/yarn compatible |
| **Handler Modules** | 16 conversion handlers |
| **Total Dependencies** | 20+ (production) + 4 (dev) |

---

## 🏗️ Architecture Overview

### Core Design Pattern: Handler-Based Converter

The project uses a **plugin architecture** where each conversion tool is wrapped in a standardized `FormatHandler` interface:

```
┌─────────────────────────────────────────────┐
│         User Interface (HTML/CSS)           │
│  - File selection & drag-drop               │
│  - Format filtering & search                │
│  - Simple/Advanced mode toggle              │
└────────────────────┬────────────────────────┘
                     │
┌────────────────────▼────────────────────────┐
│      Main Conversion Engine (main.ts)       │
│  - UI event handling                        │
│  - Conversion path finding                  │
│  - Format compatibility checking            │
└────────────────────┬────────────────────────┘
                     │
┌────────────────────▼────────────────────────┐
│      Handler Interface (FormatHandler)      │
│  - Standardized conversion contract         │
│  - Metadata management                      │
└────────────────────┬────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
   ┌────▼───┐  ┌────▼───┐  ┌────▼───┐
   │FFmpeg  │  │ImageMgk│  │Three.js│  ... (16 total)
   └────────┘  └────────┘  └────────┘
```

---

## 📁 Project Structure

### Root Level Files
- **index.html** - Main HTML entry point
- **package.json** - Node.js project configuration
- **tsconfig.json** - TypeScript compiler configuration
- **vite.config.js** - Vite bundler configuration
- **style.css** - Global styling
- **buildCache.js** - Pre-build cache generation script
- **LICENSE** - GPL-2.0 license
- **.gitignore** - Git ignore rules (enhanced)

### `/src` Directory Structure

#### Entry Points
- **main.ts** (504 lines) - Main application logic
  - UI event handling
  - File selection & validation
  - Conversion orchestration
  - Mode toggling (simple/advanced)

#### Core Interfaces
- **FormatHandler.ts** - Handler interface definition
  ```typescript
  interface FormatHandler {
    name: string;                    // Tool name (e.g., "FFmpeg")
    supportedFormats?: FileFormat[];  // Supported input/output formats
    supportAnyInput?: boolean;       // Fallback converter flag
    ready: boolean;                  // Initialization status
    init(): Promise<void>;           // Initialize handler
    doConvert(): Promise<FileData[]>; // Perform conversion
  }
  
  interface FileFormat {
    name: string;      // Long description
    format: string;    // Short formal name
    extension: string; // File extension
    mime: string;      // MIME type
    from: boolean;     // Supports input
    to: boolean;       // Supports output
    internal: string;  // Handler-specific ID
  }
  ```

- **normalizeMimeType.ts** - MIME type standardization
  - Maps non-standard MIME types to canonical forms
  - Handles WAV audio variants
  - Manages game format types (VTF, QOI, Bink)

#### Conversion Handlers (`/src/handlers`)

| Handler | Purpose | Technologies | Supported Formats |
|---------|---------|--------------|-------------------|
| **FFmpeg** | Audio/Video conversion | @ffmpeg/ffmpeg | MP3, MP4, WAV, WebM, OGG, AVI, MKV, etc. |
| **ImageMagick** | Image processing & conversion | @imagemagick/magick-wasm | PNG, JPEG, GIF, WebP, SVG, BMP, ICO, etc. |
| **Three.js** | 3D model conversion & rendering | three, three-mesh-bvh, three-bvh-csg | GLTF, GLB, OBJ, STL, FBX (via import) |
| **jszip** | Archive handling | jszip | ZIP extraction/creation |
| **Markdown** | Markdown ↔ HTML conversion | unified, remark, rehype | MD, HTML, RSS, HAST |
| **sqlite** | SQLite database handling | @sqlite.org/sqlite-wasm | DB, SQL |
| **pdftoimg** | PDF to Image conversion | pdftoimg-js | PDF → PNG/JPEG |
| **canvas-to-blob** | Canvas rendering to image | Native Canvas API | Canvas → PNG/JPEG/WebP |
| **Meyda** | Audio analysis & visualization | meyda | Audio → MFCC, Spectral data |
| **QOI-FU** | QOI image format | Custom implementation | QOI (custom) |
| **SVG ForeignObject** | SVG → Rasterized image | SVG DOM | SVG → PNG/JPEG |
| **HTML Embed** | HTML embedding & rendering | DOM API | HTML → Canvas/Blob |
| **VTF** | Valve Texture Format | Custom implementation | VTF ↔ PNG/DDS |
| **SPPD** | Custom format | Custom implementation | SPPD ↔ Data |
| **Envelope** | Audio envelope analysis | Custom DSP | Audio → Envelope data |
| **Rename** | File renaming utility | Native | Any → Any (rename only) |

### Docker Configuration
- **docker/docker-compose.yml** - Production deployment config
- **docker/docker-compose.override.yml** - Development build config
- **docker/Dockerfile** - Container image definition
- **docker/nginx/default.conf** - Nginx reverse proxy config
- **.dockerignore** - Docker build ignore rules

---

## 🔧 Key Technologies & Dependencies

### Production Dependencies
```
Core Framework:
• vite-tsconfig-paths - TypeScript path resolution
• vite-plugin-static-copy - Static asset copying
• unified - AST manipulation framework

Conversion Engines:
• @ffmpeg/ffmpeg - Video/Audio processing (WASM)
• @imagemagick/magick-wasm - Image processing (WASM)
• three - 3D graphics library
• three-mesh-bvh - 3D mesh optimization
• three-bvh-csg - 3D CSG operations
• @sqlite.org/sqlite-wasm - SQLite (WASM)
• jszip - ZIP compression
• pdftoimg-js - PDF rendering
• meyda - Audio analysis

Text Processing:
• remark & rehype - Markdown/HTML processing
• remark-gfm - GitHub Flavored Markdown support
• remark-stringify - AST to Markdown

Audio:
• wavefile - WAV file manipulation
• mime - MIME type detection
```

### Development Dependencies
```
• typescript ~5.9.3 - TypeScript compiler
• vite ^7.2.4 - Build tool & dev server
• puppeteer ^24.36.0 - Headless browser (for testing/cache generation)
```

---

## 🎨 User Interface Design

### Layout Structure
```
┌─────────────────────────────────────────────┐
│    File Selection Area (Drag & Drop)        │
│      "Click to add your file"               │
└─────────────────────────────────────────────┘

┌──────────────────┐  ┌──────────────────────┐
│  Convert From:   │  │    Convert To:       │
│  [Search]        │  │    [Search]          │
│  [Format List]   │  │    [Format List]     │
│                  │  │                      │
│ • Format 1       │  │ • Format A           │
│ • Format 2       │  │ • Format B           │
│ • Format 3       │  │ • Format C           │
│                  │  │                      │
└──────────────────┘  └──────────────────────┘

[Advanced mode]  [Convert!]

┌─────────────────────────────────────────────┐
│  Loading Popup (During Conversion)          │
│      Rotating indicator, status message     │
└─────────────────────────────────────────────┘
```

### Feature Highlights
- **Drag & Drop Support** - Intuitive file upload
- **Search Functionality** - Filter formats by name/extension
- **Dual Modes:**
  - **Simple Mode**: Group by final format
  - **Advanced Mode**: Group by handler tool
- **Real-time Status** - Loading indicators and progress feedback
- **Responsive Design** - Mobile & desktop support

---

## 🚀 Build & Deployment

### Development Workflow
```bash
# Install dependencies (using Bun)
bun install

# Start dev server with hot reload
bunx vite                    # or: bun run dev

# Build for production
bun run build               # Runs: tsc && vite build
```

### Production Deployment Options

#### Option 1: Docker (Prebuilt)
```bash
docker compose -f docker/docker-compose.yml up -d
# Accessible at: http://localhost:8080/convert/
```

#### Option 2: Docker (Local Build)
```bash
docker compose -f docker/docker-compose.yml \
                -f docker/docker-compose.override.yml \
                up --build -d
```

#### Option 3: Manual Build
```bash
bun install
bun run build
# Serve dist/ directory via web server
```

### Base Path Configuration
- Application runs at `/convert/` path (configurable in `vite.config.js`)
- Nginx proxy configured to forward requests appropriately

---

## ⚙️ Advanced Features

### Cache System
- Initial format detection can be slow (lazy initialization)
- Browser console method: `printSupportedFormatCache()`
- Cache saves to `cache.json` for faster subsequent loads
- Pre-generation available via `buildCache.js` during Docker build

### WASM Optimization
- FFmpeg and ImageMagick compiled to WebAssembly
- Excludes from optimization dependency list in `vite.config.js`
- Static WASM files copied for proper loading

### TypeScript Configuration
- **Target**: ES2022
- **Strict Mode**: Enabled
- **Module Resolution**: Bundler mode
- **Notable Settings**:
  - `noUnusedLocals: false` (should be true - temporary)
  - `noUnusedParameters: false` (should be true - temporary)
  - Allows importing TypeScript files directly

---

## 📝 File Format Support

### Input → Output Conversion Examples
- **Video** → Image (extract frames)
- **Image** → Vector (via tracing algorithms)
- **Audio** → Visualization (+MFCC/spectral data)
- **Document** → Image (PDF rendering)
- **3D Model** → Image (rendered preview)
- **Archive** → Document (listing/extraction)
- **Any Format** → Renamed variant (via rename handler)

### Format Detection
- Automatic detection based on file extension
- MIME type normalization for consistency
- Fallback handlers for generic conversions

---

## 🔍 Code Quality & Configuration

### TypeScript Settings
- Strict type checking enabled
- No unused imports warning
- Verbatim module syntax for clarity
- DOM and DOM.Iterable libraries included

### Build Output
- ES2022 target for modern browsers
- Tree-shaking enabled
- Minified production builds
- Source maps for debugging

---

## 📚 Contributing & Extension

### Adding a New Format Handler

1. **Create Handler File**: `src/handlers/myformat.ts`
2. **Implement Interface**:
   ```typescript
   import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
   
   class MyHandler implements FormatHandler {
     public name: string = "MyTool";
     public supportedFormats?: FileFormat[];
     public ready: boolean = false;
     
     async init() {
       // Initialize tool
       this.supportedFormats = [/* ... */];
       this.ready = true;
     }
     
     async doConvert(inputFiles, inputFormat, outputFormat, args?) {
       // Perform conversion
       return [/* output files */];
     }
   }
   ```
3. **Register Handler**: Add to `src/handlers/index.ts`
4. **Test**: Verify format detection and conversion works

---

## 🎭 Use Cases & Limitations

### Ideal For
- Privacy-conscious users avoiding cloud uploads
- Batch conversions between obscure formats
- Game asset format conversions (VTF, SPPD)
- Image manipulation without online services
- Audio analysis and visualization

### Current Limitations
- Requires modern browser with WASM support
- Large files may be slow (depends on browser resources)
- Some formats require specific handler implementations
- No built-in queue/batch processing UI (but technically possible)

---

## 📦 Project Metadata

| Property | Value |
|----------|-------|
| **Package Name** | convert |
| **Version** | 0.0.0 |
| **Module Type** | ESM (type: "module") |
| **Repository** | github.com/p2r3/convert |
| **License** | GPL-2.0 |
| **Maintainer** | p2r3 |

---

## 🔗 Important Links

- **Live Demo**: https://convert.to.it/
- **GitHub**: https://github.com/p2r3/convert
- **Issue Reporting Guidelines**: See README.md Contributing section
- **YouTube Overview**: https://youtu.be/btUbcsTbVA8

---

## 🛠️ Development Tips

1. **Git Clone**: Must use `--recursive` to include submodules
   ```bash
   git clone --recursive https://github.com/p2r3/convert
   ```

2. **Performance**: Generate `cache.json` after first load to skip format detection

3. **Docker Development**: Use `docker-compose.override.yml` for live code reloading

4. **TypeScript Errors**: Some unused variable warnings are intentional (temporary config)

5. **WASM Debugging**: Check browser DevTools Network tab for `.wasm` file loading

---

Generated: February 17, 2026  
Project Branch: Beta (master is default)
