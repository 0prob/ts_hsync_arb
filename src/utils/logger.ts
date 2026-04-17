// @ts-nocheck
/**
 * src/utils/logger.js — Structured logging with pino
 */
import pino from "pino";

const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const LOG_FORMAT = (process.env.LOG_FORMAT || (process.stdout.isTTY ? "pretty" : "json"))
  .trim()
  .toLowerCase();

function createDestination() {
  if (LOG_LEVEL === "silent") return undefined;

  if (LOG_FORMAT === "pretty") {
    return pino.transport({
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss.l",
        ignore: "pid,hostname",
      },
    });
  }

  return pino.destination({ sync: false });
}

export const logger = pino(
  {
    level: LOG_LEVEL,
    base: null,
  },
  createDestination()
);

export default logger;
