import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import http from "node:http";
import { setImmediate as waitImmediate } from "node:timers/promises";

process.env.LOG_LEVEL = "silent";

type FakeServerMode = "error" | "listen";

class FakeServer extends EventEmitter {
  closed = false;
  listenedPort: number | null = null;

  constructor(readonly mode: FakeServerMode) {
    super();
  }

  listen(port: number, onListening?: () => void) {
    this.listenedPort = port;
    if (this.mode === "error") {
      queueMicrotask(() => {
        const error = Object.assign(new Error("listen EADDRINUSE"), { code: "EADDRINUSE" });
        this.emit("error", error);
      });
    } else {
      queueMicrotask(() => onListening?.());
    }
    return this;
  }

  close(onClose?: (err?: Error) => void) {
    this.closed = true;
    onClose?.();
    return this;
  }
}

const originalCreateServer = http.createServer;
const servers: FakeServer[] = [];
(http as any).createServer = () => {
  const server = new FakeServer(servers.length === 0 ? "error" : "listen");
  servers.push(server);
  return server;
};

try {
  const { startMetricsServer, stopMetricsServer } = await import(
    `../src/utils/metrics.ts?metrics-test-${Date.now()}`
  );

  startMetricsServer(19191);
  await waitImmediate();

  startMetricsServer(0);
  await waitImmediate();
  stopMetricsServer();

  assert.equal(servers.length, 2, "metrics server should be restartable after bind failure");
  assert.equal(servers[0].listenedPort, 19191);
  assert.equal(servers[1].listenedPort, 0);
  assert.equal(servers[1].closed, true);
} finally {
  (http as any).createServer = originalCreateServer;
}

console.log("Metrics server checks passed.");
