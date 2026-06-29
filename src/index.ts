import { createServer } from "node:http";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import "./bot/bot.js";

const port = Number(process.env["PORT"] ?? "3000");

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env["PORT"]}"`);
}

const server = createServer(app);

server.listen(port, () => {
  logger.info({ port }, "Server listening");
});

server.on("error", (err) => {
  logger.error({ err }, "Server error");
  process.exit(1);
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received — shutting down");
  server.close(() => process.exit(0));
});
