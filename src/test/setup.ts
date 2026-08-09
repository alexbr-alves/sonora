import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);

class IndexedDBMock {
  open() { return {} as IDBOpenDBRequest; }
}

Object.defineProperty(globalThis, "indexedDB", { value: new IndexedDBMock(), writable: true });
