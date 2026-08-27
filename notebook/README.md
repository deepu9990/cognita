# Cognita GPU Notebook Service

This folder contains the FastAPI inference service used when Cognita runs models on a GPU notebook or another machine. It implements the endpoint contract expected by the Node backend: `GET /health`, `GET /models`, and `POST /chat` with Server-Sent Events.

## Setup

Use Python 3.10 or newer and a CUDA-compatible PyTorch installation for GPU inference.

```powershell
cd notebook
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Set these values in `.env`:

```env
NGROK_AUTHTOKEN=your-ngrok-auth-token
TAVILY_API_KEY=your-tavily-api-key
```

`TAVILY_API_KEY` enables searches for current or time-sensitive questions. The file is ignored by Git. In Kaggle, the scripts also fall back to secrets with the same names.

## Run locally

Start the API. Model loading happens once during application startup.

```powershell
python run_server.py
```

Confirm that it started:

```powershell
Invoke-RestMethod http://localhost:8000/health
```

In another terminal, expose it through ngrok:

```powershell
python start_tunnel.py
```

Copy the printed public URL to `OLLAMA_HOST` in the root backend's `.env`. For a public ngrok domain, the backend automatically uses the FastAPI protocol and provides the ngrok warning-skip header.

## Kaggle notebook

Install the same dependencies in a notebook cell, then either upload this folder or run its files from a mounted dataset. Store `NGROK_AUTHTOKEN` and `TAVILY_API_KEY` as Kaggle secrets. Run the server in one notebook cell and the tunnel launcher in another; the launcher reads Kaggle secrets when `.env` is unavailable.

## Model configuration

Models live in `load_models.py`. `MODELS_TO_LOAD` controls what startup loads, and `DEFAULT_MODEL` selects the model when the client does not send one. Loading both listed models needs substantial VRAM; for a smaller GPU use:

```env
MODELS_TO_LOAD=qwen3-4b
DEFAULT_MODEL=qwen3-4b
```
