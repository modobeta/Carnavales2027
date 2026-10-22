import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto;

const hasStorageApi = (storage) =>
  storage &&
  typeof storage.getItem === "function" &&
  typeof storage.setItem === "function" &&
  typeof storage.removeItem === "function" &&
  typeof storage.clear === "function";

if (typeof window !== "undefined" && !hasStorageApi(window.localStorage)) {
  const store = new Map();
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: (key) => (store.has(String(key)) ? store.get(String(key)) : null),
      setItem: (key, value) => void store.set(String(key), String(value)),
      removeItem: (key) => void store.delete(String(key)),
      clear: () => void store.clear(),
      key: (index) => [...store.keys()][index] ?? null,
      get length() { return store.size; },
    },
    configurable: true,
  });
}

// Node >= 22 puede exponer un `globalThis.localStorage` incompleto que Vitest no
// reemplaza al montar jsdom. Los tests usan tanto `localStorage` como
// `window.localStorage`, así que ambos deben apuntar al mismo Storage real.
if (typeof window !== "undefined" && hasStorageApi(window.localStorage)) {
  if (!hasStorageApi(globalThis.localStorage)) {
    Object.defineProperty(globalThis, "localStorage", {
      value: window.localStorage,
      configurable: true,
      writable: true,
    });
  }
}

if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

// jsdom no implementa object URLs; el formulario de comparsa los usa para la
// vista previa local del logo seleccionado.
if (typeof URL !== "undefined" && !URL.createObjectURL) {
  URL.createObjectURL = () => "blob:mock-preview";
  URL.revokeObjectURL = () => {};
}
