import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import logger from "../logger.ts";

const log = logger.scoped("ThreeJS");

class threejsHandler implements FormatHandler {

  public name: string = "threejs";
  public supportedFormats = [
    {
      name: "GL Transmission Format Binary",
      format: "glb",
      extension: "glb",
      mime: "model/gltf-binary",
      from: true,
      to: false,
      internal: "glb"
    },
    {
      name: "Portable Network Graphics",
      format: "png",
      extension: "png",
      mime: "image/png",
      from: false,
      to: true,
      internal: "png"
    },
    {
      name: "Joint Photographic Experts Group JFIF",
      format: "jpeg",
      extension: "jpg",
      mime: "image/jpeg",
      from: false,
      to: true,
      internal: "jpeg"
    },
    {
      name: "WebP",
      format: "webp",
      extension: "webp",
      mime: "image/webp",
      from: false,
      to: true,
      internal: "webp"
    },
  ];
  public ready: boolean = false;

  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(90, 16 / 9, 0.1, 4096);
  private renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });

  async init () {
    log.info("Initializing WebGL renderer (1920x1080, antialiased)");
    this.renderer.setSize(1920, 1080);
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Add proper lighting so models aren't rendered black
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(5, 10, 7);
    this.scene.add(directionalLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-5, 0, -5);
    this.scene.add(fillLight);

    this.ready = true;
  }

  async doConvert (
    inputFiles: FileData[],
    _inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];

    for (const inputFile of inputFiles) {

      const blob = new Blob([inputFile.bytes as BlobPart]);
      const url = URL.createObjectURL(blob);

      log.debug(`Loading GLB model: ${inputFile.name} (${(inputFile.bytes.length / 1024).toFixed(1)}KB)`);

      const gltf: GLTF = await new Promise((resolve, reject) => {
        const loader = new GLTFLoader();
        loader.load(url, resolve, undefined, reject);
      });

      URL.revokeObjectURL(url);

      // Auto-frame the model: compute bounding box and position camera
      const bbox = new THREE.Box3().setFromObject(gltf.scene);
      const center = bbox.getCenter(new THREE.Vector3());
      const size = bbox.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const distance = maxDim * 1.5;

      log.debug(`Model loaded — bounding box: ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}, camera distance: ${distance.toFixed(2)}`);

      this.camera.position.set(
        center.x + distance * 0.5,
        center.y + distance * 0.3,
        center.z + distance
      );
      this.camera.lookAt(center);

      this.scene.add(gltf.scene);
      this.renderer.render(this.scene, this.camera);
      this.scene.remove(gltf.scene);

      // Dispose of loaded geometry/materials to free GPU memory
      gltf.scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material?.dispose();
          }
        }
      });

      const bytes: Uint8Array = await new Promise((resolve, reject) => {
        this.renderer.domElement.toBlob((blob) => {
          if (!blob) return reject("Canvas output failed");
          blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)));
        }, outputFormat.mime);
      });
      const name = inputFile.name.split(".")[0] + "." + outputFormat.extension;
      outputFiles.push({ bytes, name });

    }

    return outputFiles;
  }

}

export default threejsHandler;