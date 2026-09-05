import asyncio
import nest_asyncio
import uvicorn
from pyngrok import ngrok
import os
from colab_setup import setup_colab_environment
from app.main import app

def run_server(ngrok_auth_token=None):
    # 1. Mount drive and set HF_HOME
    setup_colab_environment()

    # 2. Authenticate ngrok if token is provided
    if ngrok_auth_token:
        ngrok.set_auth_token(ngrok_auth_token)

    # 3. Create a public URL via ngrok
    public_url = ngrok.connect(8000).public_url
    print(f"🚀 FastAPI server is live and publicly accessible at: {public_url}")
    print(f"Swagger UI available at: {public_url}/docs")
    print("-" * 50)

    # 4. Apply nest_asyncio to allow uvicorn to run inside Colab's Jupyter event loop
    nest_asyncio.apply()

    # 5. Start the uvicorn server
    uvicorn.run(app, host="0.0.0.0", port=8000)

if __name__ == "__main__":
    # Replace with your actual ngrok token if you want a stable/longer-lasting session
    # Or leave as None for a temporary session (might have restrictions)
    print("Starting server setup on Colab...")
    run_server(ngrok_auth_token="YOUR_NGROK_AUTH_TOKEN_HERE")
