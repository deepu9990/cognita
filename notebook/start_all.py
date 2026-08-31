import os
import sys
import threading
import time
import requests
import uvicorn
from dotenv import load_dotenv
from pyngrok import ngrok

# Load .env from local directory if present
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
load_dotenv()


def get_secret(name: str, default: str = "") -> str:
    val = os.getenv(name)
    if val:
        return val
    try:
        from kaggle_secrets import UserSecretsClient

        return UserSecretsClient().get_secret(name) or default
    except Exception:
        return default


def start_uvicorn():
    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "0.0.0.0")
    uvicorn.run("app:app", host=host, port=port, log_level="info")


_server_thread = None
_public_url = None


def start_background(wait_for_exit: bool = False) -> str:
    """Start Cognita AI FastAPI server & Ngrok tunnel.

    In Jupyter / Kaggle notebooks: call with wait_for_exit=False (default)
    to run in the background without blocking notebook cells!
    """
    global _server_thread, _public_url

    # 0. Load secrets from Kaggle Secrets or .env
    SECRET_KEYS = [
        "NGROK_AUTHTOKEN",
        "TAVILY_API_KEY",
        "DATABASE_URL",
        "HF_TOKEN",
        "MODELS_TO_LOAD",
    ]
    for key in SECRET_KEYS:
        val = get_secret(key)
        if val:
            os.environ.setdefault(key, val)

    loaded = [k for k in SECRET_KEYS if os.getenv(k)]
    missing = [k for k in SECRET_KEYS if not os.getenv(k)]
    print("🔑 Loaded secrets:", ", ".join(loaded) if loaded else "(none)", flush=True)
    if missing:
        print("   Missing (optional):", ", ".join(missing), flush=True)

    # 1. Start FastAPI server in a background daemon thread
    if _server_thread is None or not _server_thread.is_alive():
        print("🚀 Starting Cognita AI server in background thread...", flush=True)
        _server_thread = threading.Thread(target=start_uvicorn, daemon=True)
        _server_thread.start()
    else:
        print("ℹ️ Server thread is already running.", flush=True)

    # 2. Poll /health until server is ready
    port = int(os.getenv("PORT", "8000"))
    health_url = f"http://127.0.0.1:{port}/health"
    print("⏳ Waiting for models to load and server to become healthy...", flush=True)

    is_ready = False
    for attempt in range(90):
        try:
            res = requests.get(health_url, timeout=3)
            if res.status_code == 200:
                health_data = res.json()
                print("✅ FastAPI Server is ready!", flush=True)
                print(f"   - CUDA Available: {health_data.get('cuda')}", flush=True)
                print(f"   - Models Loaded: {health_data.get('models_loaded')}", flush=True)
                print(f"   - RAG Available: {health_data.get('rag', {}).get('available')}", flush=True)
                is_ready = True
                break
        except Exception:
            time.sleep(2)

    if not is_ready:
        print("⚠️ Server took longer than expected to report health. Starting tunnel anyway...", flush=True)

    # 3. Start Ngrok Tunnel
    token = get_secret("NGROK_AUTHTOKEN")
    if not token or token == "your-ngrok-auth-token":
        print("❌ NGROK_AUTHTOKEN is missing. Set it in Kaggle Secrets or .env.", flush=True)
        return ""

    ngrok.set_auth_token(token)

    # Disconnect existing tunnels
    for tunnel in ngrok.get_tunnels():
        try:
            ngrok.disconnect(tunnel.public_url)
        except Exception:
            pass

    public_tunnel = ngrok.connect(addr=port, proto="http")
    _public_url = public_tunnel.public_url

    print("\n" + "=" * 65, flush=True)
    print(f"🎉 COGNITA PUBLIC URL: {_public_url}", flush=True)
    print("=" * 65, flush=True)
    print("📋 Paste this into your backend's .env file:", flush=True)
    print(f"INFERENCE_HOST={_public_url}", flush=True)
    print("=" * 65, flush=True)

    if wait_for_exit:
        print("⚡ Server and tunnel are active! (Blocking main thread - press Ctrl+C to stop)", flush=True)
        print("=" * 65 + "\n", flush=True)
        try:
            ngrok_process = ngrok.get_ngrok_process()
            ngrok_process.proc.wait()
        except (KeyboardInterrupt, SystemExit):
            print("\nShutting down Cognita server and tunnel...", flush=True)
    else:
        print("⚡ Server and tunnel running in background! Notebook cell is unblocked.", flush=True)
        print("   You can now run ingestion and benchmark cells below.", flush=True)
        print("=" * 65 + "\n", flush=True)

    return _public_url


def stop_all():
    """Stop ngrok tunnels and background server."""
    print("Shutting down ngrok tunnels...", flush=True)
    try:
        ngrok.kill()
        print("✅ Ngrok stopped.", flush=True)
    except Exception as e:
        print(f"Error stopping ngrok: {e}", flush=True)


def main():
    # If run as CLI script: block by default unless --no-wait or --background is passed
    no_wait = "--no-wait" in sys.argv or "--background" in sys.argv
    start_background(wait_for_exit=not no_wait)


if __name__ == "__main__":
    main()
