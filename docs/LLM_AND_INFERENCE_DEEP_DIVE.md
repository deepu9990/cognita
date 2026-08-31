# Part 2: Large Language Models, Quantization, GPU Computing & Serving

This document provides an engineering deep dive into the machine learning models, quantization mechanics, GPU memory calculations, Hugging Face abstractions, and runtime architectures powering **Cognita AI**.

---

## Table of Contents

1. [Causal Language Models & Autoregressive Decoding](#1-causal-language-models--autoregressive-decoding)
2. [Model Quantization & 4-Bit NF4 (BitsAndBytes)](#2-model-quantization--4-bit-nf4-bitsandbytes)
3. [VRAM Calculation & Hardware Requirements](#3-vram-calculation--hardware-requirements)
4. [Hugging Face Transformers Architecture](#4-hugging-face-transformers-architecture)
5. [Serving with FastAPI, Uvicorn & Async Lifespan](#5-serving-with-fastapi-uvicorn--async-lifespan)
6. [PyNgrok & Reverse Tunneling Mechanics](#6-pyngrok--reverse-tunneling-mechanics)
7. [Persistent Kernel Threading in Jupyter & Kaggle](#7-persistent-kernel-threading-in-jupyter--kaggle)

---

## 1. Causal Language Models & Autoregressive Decoding

### What is a Causal Language Model (Causal LM)?

A **Causal Language Model** (such as Qwen 2.5 / Qwen 3, LLaMA, or Mistral) is a decoder-only transformer neural network trained on the objective of **Next-Token Prediction**:

$$P(W) = \prod_{i=1}^{n} P(w_i \mid w_1, w_2, \dots, w_{i-1})$$

The term _"causal"_ means that the model's attention mechanism is strictly masked so that token $w_i$ can only attend to previous tokens ($w_1 \dots w_{i-1}$) and cannot look forward into future tokens.

### What is Autoregressive Decoding?

When generating text, the model processes the prompt, computes probability distributions over the entire vocabulary (e.g. 151,643 tokens in Qwen), selects the most likely token (via greedy search, top-p, or temperature sampling), appends that token to the input sequence, and repeats the process:

```
Step 1: ["The", "capital", "of", "France", "is"] -> Model -> "Paris"
Step 2: ["The", "capital", "of", "France", "is", "Paris"] -> Model -> "."
```

### Why does this matter for streaming?

Because generation happens **one token at a time**, we don't need to wait for the entire response to complete before sending text to the user. Using Hugging Face's `TextIteratorStreamer`, as each token ID is decoded into a UTF-8 string chunk, we yield it immediately through the Server-Sent Events stream.

---

## 2. Model Quantization & 4-Bit NF4 (BitsAndBytes)

### What is Quantization?

Neural network weights are natively stored as high-precision floating point numbers (typically **FP32** requiring 32 bits / 4 bytes per parameter, or **FP16 / BF16** requiring 16 bits / 2 bytes per parameter).

**Quantization** is the process of mapping high-precision continuous floating-point weights into a discrete low-bit representation (such as 8-bit integers or 4-bit data types) without significantly degrading model intelligence.

```
FP16 (16 bits per weight):
  [+0.1245]  [-0.9841]  [+1.4120]  [-0.0034]

INT4 / NF4 (4 bits per weight):
  [ 0010 ]   [ 1101 ]   [ 0111 ]   [ 0000 ]
```

### What is NF4 (NormalFloat 4)?

NormalFloat 4 (NF4) is an information-theoretically optimal quantile quantization data type introduced in the **QLoRA** paper (Dettmers et al., 2023). Because pre-trained neural network weights follow a zero-centered normal distribution, NF4 spaces out its 16 discrete quantization bins such that each bin has an equal probability of containing weights. This preserves significantly higher accuracy than uniform integer quantization (INT4).

### Key Features of BitsAndBytes Quantization in Cognita:

In `notebook/load_models.py`:

```python
QUANTIZATION_CONFIG = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.float16,
    bnb_4bit_use_double_quant=True,
)
```

1. **`load_in_4bit=True`**: Compresses base model parameters down to 4 bits each.
2. **`bnb_4bit_quant_type="nf4"`**: Uses the mathematically optimal NormalFloat4 distribution.
3. **`bnb_4bit_compute_dtype=torch.float16`**: While weights are stored in VRAM as 4-bit, when matrix multiplication happens in the CUDA cores during the forward pass, they are dequantized on-the-fly into FP16 for fast tensor core computation.
4. **`bnb_4bit_use_double_quant=True`**: Quantizes the quantization constants themselves (saving an extra 0.37 bits per parameter, or ~300 MB on a 7B model).

---

## 3. VRAM Calculation & Hardware Requirements

### The Formula for Model Memory:

$$\text{VRAM}_{\text{weights}} \approx \text{Parameters} \times \frac{\text{Bits per Parameter}}{8} \times 1.2$$

_(The 1.2 multiplier accounts for CUDA context overhead, activation buffers, and the KV cache)._

### Memory Requirements by Model & Precision:

| Model            | Parameters    | FP16 Memory | 4-Bit NF4 Memory _(Cognita)_ | Fits in Free T4 GPU (16 GB)? |
| :--------------- | :------------ | :---------- | :--------------------------- | :--------------------------- |
| **Qwen 3 4B**    | ~4 Billion    | ~8.0 GB     | **~2.8 GB**                  | **Yes (Ultra-fast)**         |
| **Qwen 2.5 7B**  | ~7.6 Billion  | ~15.2 GB    | **~5.2 GB**                  | **Yes (Comfortable)**        |
| **Qwen 3.5 9B**  | ~9 Billion    | ~18.0 GB    | **~6.5 GB**                  | **Yes (Comfortable)**        |
| **Qwen 2.5 14B** | ~14.7 Billion | ~29.4 GB    | **~9.8 GB**                  | **Yes (Comfortable)**        |

### Why this enables Free Kaggle/Colab deployment:

Standard free cloud environments (Kaggle, Google Colab) offer an **NVIDIA Tesla T4 GPU with 16 GB of VRAM**.

- Running 7B or 9B models in unquantized FP16 requires 15-18 GB, which results in `CUDA Out of Memory (OOM)` errors.
- Running them in **4-bit NF4** requires only 5-7 GB of VRAM, leaving ample room to load an embedding model (`sentence-transformers/all-MiniLM-L6-v2` at ~120 MB) and manage long context sequences!

---

## 4. Hugging Face Transformers Architecture

Cognita uses the official Hugging Face `transformers` Python ecosystem in `notebook/load_models.py`:

### 1. `AutoTokenizer`

Converts raw string sentences into numeric token IDs:

```python
tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
input_ids = tokenizer.apply_chat_template(messages, return_tensors="pt")
```

The **Chat Template** automatically inserts the exact prompt delimiters expected by the model (e.g. `<|im_start|>system\n...<|im_end|>\n<|im_start|>user\n...`).

### 2. `AutoModelForCausalLM`

Loads the model architecture and weights onto the target device:

```python
models[model_id] = AutoModelForCausalLM.from_pretrained(
    model_name,
    device_map="auto",
    quantization_config=QUANTIZATION_CONFIG,
    trust_remote_code=True,
)
```

- **`device_map="auto"`**: Uses the `accelerate` library to automatically detect GPU availability. If a GPU is present, it loads all layers into CUDA VRAM; if VRAM is exceeded, it gracefully offloads remaining layers to system RAM.
- **`trust_remote_code=True`**: Allows custom model architectures (like newly published Qwen variants) that provide their own modeling code on Hugging Face Hub to instantiate safely.

### 3. Fault-Tolerant Loading

In `notebook/load_models.py`, individual models are wrapped in isolated `try...except` blocks. If one model fails to download or has an upstream format discrepancy, the server logs a warning and continues startup so all healthy models remain fully accessible.

---

## 5. Serving with FastAPI, Uvicorn & Async Lifespan

### Why FastAPI & Uvicorn?

- **Uvicorn**: An ultra-fast, lightweight ASGI (Asynchronous Server Gateway Interface) web server implementation for Python based on `uvloop` and `httptools`.
- **FastAPI**: A modern Python web framework providing high performance, native async support, Pydantic type validation, and automatic OpenAPI schema generation.

### Async Lifespan Management

In `notebook/app.py`, we use the modern `lifespan` context manager rather than deprecated `@app.on_event("startup")`:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        load_configured_models()
        load_embedding_model()
    except Exception as err:
        logger.warning(f"Error during model startup loading: {err}")
    yield
    # Clean up GPU memory or close poolers on shutdown
```

This guarantees that heavy model weights are preloaded into GPU VRAM before the HTTP port begins accepting incoming requests.

---

## 6. PyNgrok & Reverse Tunneling Mechanics

### The Problem

When you run a notebook on Google Colab or Kaggle:

1. The virtual machine sits inside an isolated Google/AWS VPC behind strict Network Address Translation (NAT) and firewalls.
2. The notebook does **not** have a public IPv4 address.
3. Your local development laptop cannot send an HTTP POST request to `http://127.0.0.1:8000` inside Google's data center.

### The Solution: Secure Reverse Tunnels

```
┌─────────────────────────┐               ┌──────────────────────────┐               ┌────────────────────────┐
│ Kaggle GPU (Colab VM)   │               │       Ngrok Cloud        │               │ Local Laptop (Dev)     │
│                         │               │                          │               │                        │
│ FastAPI (port 8000)     │               │ Public Edge Proxy        │               │ Express BFF / React    │
│           ▲             │               │                          │               │                        │
│           │ localhost   │               │                          │               │                        │
│     pyngrok client ─────┼─ Secure TLS ─►│ https://xyz.ngrok-free.dev│◄── HTTP Req ──│ INFERENCE_HOST=...     │
└─────────────────────────┘   Tunnel      └──────────────────────────┘               └────────────────────────┘
```

1. When `notebook/start_all.py` executes, `pyngrok` initiates an outbound persistent TLS connection to the Ngrok cloud edge network.
2. Ngrok assigns a unique public DNS endpoint (e.g. `https://ramp-coauthor-pension.ngrok-free.dev`).
3. When your Node.js backend sends a request to that URL, Ngrok routes the traffic down the established TLS tunnel directly to `127.0.0.1:8000` inside your Kaggle VM, completely bypassing NAT and inbound firewall blocks!

---

## 7. Persistent Kernel Threading in Jupyter & Kaggle

### The Cell-Blocking Dilemma

In a Jupyter notebook:

- Running `!python start_all.py` executes a command in a child bash subshell.
- If the script blocks (`proc.wait()`), the notebook cell stays running forever, preventing you from executing any other cells.
- If the script exits, the subshell dies, and all background server processes are immediately killed by the OS.

### The Cognita Solution: Native In-Process Daemon Threading

Instead of running a bash command, Cognita provides `start_background()`:

```python
import sys
sys.path.insert(0, ".")
from start_all import start_background

public_url = start_background()
```

1. **Persistent IPython Kernel**: The Jupyter kernel itself is a long-running Python process.
2. **Daemon Threads**: `start_background()` launches Uvicorn inside a Python `threading.Thread(target=start_uvicorn, daemon=True)`.
3. **Non-Blocking Cell Completion**: It polls `/health` until the server is ready, starts the Ngrok tunnel, prints the public URL, and **returns immediately**.
4. The cell finishes with a green checkmark `✓`, freeing the notebook while FastAPI and Ngrok continue running in the background. Subsequent cells (for document ingestion or benchmark testing) can then run concurrently!
