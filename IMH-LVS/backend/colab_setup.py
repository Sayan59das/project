import os
from google.colab import drive

def setup_colab_environment():
    """
    Mounts Google Drive and sets the HuggingFace cache directory 
    to ensure weights are permanently stored in Google Drive.
    """
    # Mount Google Drive
    print("Mounting Google Drive...")
    drive.mount('/content/drive')
    
    # Define HF cache path in Google Drive
    hf_cache_dir = '/content/drive/MyDrive/huggingface_cache'
    
    # Create the directory if it doesn't exist
    os.makedirs(hf_cache_dir, exist_ok=True)
    
    # Set the environment variable
    os.environ['HF_HOME'] = hf_cache_dir
    print(f"HF_HOME set to: {os.environ['HF_HOME']}")

if __name__ == "__main__":
    setup_colab_environment()
