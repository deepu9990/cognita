import { app } from "./app.js";
import { ollamaService } from "./services/ollama.service.js";

const port = Number(process.env.PORT ?? 5000);
const ollamaModel = process.env.OLLAMA_MODEL ?? "qwen3:4b";

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

app.listen(port, () => {
  console.log(`Local GPT backend listening on http://localhost:${port}`);
  console.log(`Ollama host(s): ${ollamaService.getHosts().join(", ")}`);
  console.log(`Ollama model: ${ollamaModel}`);
});
