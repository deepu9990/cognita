import os

from dotenv import load_dotenv
from pyngrok import ngrok

load_dotenv()


def get_secret(name: str) -> str:
    value = os.getenv(name)
    if value:
        return value
    try:
        from kaggle_secrets import UserSecretsClient

        return UserSecretsClient().get_secret(name)
    except ImportError as error:
        raise RuntimeError(f"Set {name} in .env before starting the tunnel.") from error


if __name__ == "__main__":
    ngrok.set_auth_token(get_secret("NGROK_AUTHTOKEN"))
    for tunnel in ngrok.get_tunnels():
        ngrok.disconnect(tunnel.public_url)

    port = int(os.getenv("PORT", "8000"))
    tunnel = ngrok.connect(addr=port, proto="http")
    print(f"Cognita API is publicly available at: {tunnel.public_url}")
    print("Keep this process running while the API is in use.")