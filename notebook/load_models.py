import os

try:
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
    TORCH_AVAILABLE = True
except ImportError:
    torch = None
    AutoModelForCausalLM = None
    AutoTokenizer = None
    BitsAndBytesConfig = None
    TORCH_AVAILABLE = False


MODEL_CONFIGS = {
    "qwen3-4b": {
        "name": "Qwen/Qwen3-4B",
        "display_name": "Qwen 3 4B",
        "description": "Fast general-purpose model",
        "quantized": False,
    },
    "qwen3.5-9b": {
        "name": "Qwen/Qwen3.5-9B",
        "display_name": "Qwen 3.5 9B",
        "description": "Stronger reasoning and general-purpose model",
        "quantized": True,
    },
}

models = {}
tokenizers = {}

if TORCH_AVAILABLE and torch and BitsAndBytesConfig:
    QUANTIZATION_CONFIG = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.float16,
        bnb_4bit_use_double_quant=True,
    )
else:
    QUANTIZATION_CONFIG = None


def load_model(model_id: str) -> None:
    if not TORCH_AVAILABLE:
        print("PyTorch / Transformers not installed in current environment; skipping LLM loading.", flush=True)
        return

    if model_id in models:
        return

    config = MODEL_CONFIGS[model_id]
    print(f"Loading {config['display_name']} ({config['name']})", flush=True)

    tokenizer = AutoTokenizer.from_pretrained(config["name"])
    kwargs = {
        "device_map": "auto",
        "torch_dtype": torch.float16 if (torch and torch.cuda.is_available()) else torch.float32,
    }
    if config["quantized"] and QUANTIZATION_CONFIG:
        kwargs["quantization_config"] = QUANTIZATION_CONFIG

    models[model_id] = AutoModelForCausalLM.from_pretrained(
        config["name"],
        **kwargs,
    )
    tokenizers[model_id] = tokenizer
    print(f"{config['display_name']} loaded", flush=True)


def load_configured_models() -> None:
    requested_models = os.getenv("MODELS_TO_LOAD", "qwen3-4b").split(",")
    requested_models = os.getenv("MODELS_TO_LOAD", "qwen3-4b,qwen3.5-9b").split(",")
    for model_id in (model.strip() for model in requested_models):
        if model_id:
            if model_id not in MODEL_CONFIGS:
                raise ValueError(f"Unknown model in MODELS_TO_LOAD: {model_id}")
            load_model(model_id)


def load_embedding_model() -> None:
    """Load the configured embedding model for RAG."""
    try:
        from rag.embeddings import EmbeddingService

        embedder = EmbeddingService.get_instance()
        embedder.load_model()
        print(f"Embedding model '{embedder.model_name}' loaded.", flush=True)
    except Exception as err:
        print(f"Embedding model initialization deferred or skipped: {err}", flush=True)