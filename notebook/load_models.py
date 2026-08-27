import os

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig


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

QUANTIZATION_CONFIG = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.float16,
    bnb_4bit_use_double_quant=True,
)


def load_model(model_id: str) -> None:
    if model_id in models:
        return

    config = MODEL_CONFIGS[model_id]
    print(f"Loading {config['display_name']} ({config['name']})", flush=True)

    tokenizer = AutoTokenizer.from_pretrained(config["name"])
    kwargs = {
        "device_map": "auto",
        "torch_dtype": torch.float16 if torch.cuda.is_available() else torch.float32,
    }
    if config["quantized"]:
        kwargs["quantization_config"] = QUANTIZATION_CONFIG

    models[model_id] = AutoModelForCausalLM.from_pretrained(
        config["name"],
        **kwargs,
    )
    tokenizers[model_id] = tokenizer
    print(f"{config['display_name']} loaded", flush=True)


def load_configured_models() -> None:
    requested_models = os.getenv("MODELS_TO_LOAD", "qwen3-4b").split(",")
    for model_id in (model.strip() for model in requested_models):
        if model_id:
            if model_id not in MODEL_CONFIGS:
                raise ValueError(f"Unknown model in MODELS_TO_LOAD: {model_id}")
            load_model(model_id)