import os
import threading
import time
import requests
import uvicorn
from dotenv import load_dotenv
from pyngrok import ngrok

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


def main():
    # 1. Start FastAPI server in a background daemon thread
    print("🚀 Starting Cognita AI server in background thread...", flush=True)
    server_thread = threading.Thread(target=start_uvicorn, daemon=True)
    server_thread.start()

    # 2. Poll /health until server is ready
    port = int(os.getenv("PORT", "8000"))
    health_url = f"http://127.0.0.1:{port}/health"
    print("⏳ Waiting for models to load and server to become healthy...", flush=True)

    is_ready = False
    for attempt in range(60):
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
        return

    ngrok.set_auth_token(token)

    # Disconnect existing tunnels
    for tunnel in ngrok.get_tunnels():
        try:
            ngrok.disconnect(tunnel.public_url)
        except Exception:
            pass

    public_tunnel = ngrok.connect(addr=port, proto="http")

    print("\n" + "=" * 65, flush=True)
    print(f"🎉 COGNITA PUBLIC URL: {public_tunnel.public_url}", flush=True)
    print("=" * 65, flush=True)
    print("📋 Paste this into your backend's .env file:", flush=True)
    print(f"INFERENCE_HOST={public_tunnel.public_url}", flush=True)
    print("=" * 65, flush=True)
    print("⚡ Server and tunnel are active! Keep this Kaggle cell running.", flush=True)
    print("=" * 65 + "\n", flush=True)

    # Keep the main thread alive so the background server and tunnel stay online
    try:
        ngrok_process = ngrok.get_ngrok_process()
        ngrok_process.proc.wait()
    except (KeyboardInterrupt, SystemExit):
        print("\nShutting down Cognita server and tunnel...", flush=True)


if __name__ == "__main__":
    main()
