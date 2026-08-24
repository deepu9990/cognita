import { app } from "./app.js";
import { connectDatabase } from "./config/db.js";
import { env } from "./config/env.js";
import { ollamaService } from "./services/ollama.service.js";

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

async function start(): Promise<void> {
  await connectDatabase();
  console.log("MongoDB connected");

  app.listen(env.PORT, () => {
    console.log(`Cognita backend listening on http://localhost:${env.PORT}`);
    console.log(`Ollama host(s): ${ollamaService.getHosts().join(", ")}`);
    console.log(`Ollama model: ${env.OLLAMA_MODEL}`);
  });
}

start().catch((error) => {
  console.error("Failed to start backend:", error);
  process.exit(1);
});
