import os
from typing import List, Optional

try:
    import torch
    TORCH_AVAILABLE = True
except ImportError:
    torch = None
    TORCH_AVAILABLE = False

from .config import get_rag_config, logger


class EmbeddingService:
    """Dedicated embedding service with GPU support and singleton caching."""

    _instance: Optional["EmbeddingService"] = None

    def __init__(self, model_name: Optional[str] = None, dimension: Optional[int] = None):
        cfg = get_rag_config()
        self.model_name = model_name or cfg.embedding_model
        self.dimension = dimension or cfg.embedding_dimension
        self.device = "cuda" if (TORCH_AVAILABLE and torch and torch.cuda.is_available()) else "cpu"
        self._model = None
        self._tokenizer = None
        self._sentence_transformer = None
        self._initialized = False

    @classmethod
    def get_instance(cls, model_name: Optional[str] = None, dimension: Optional[int] = None) -> "EmbeddingService":
        if cls._instance is None:
            cls._instance = cls(model_name=model_name, dimension=dimension)
        return cls._instance

    def load_model(self) -> None:
        if self._initialized:
            return

        logger.info(f"Loading embedding model: {self.model_name} on device: {self.device}")
        try:
            from sentence_transformers import SentenceTransformer

            self._sentence_transformer = SentenceTransformer(self.model_name, device=self.device)
            self._initialized = True
            logger.info(f"Loaded sentence-transformers model: {self.model_name}")
            return
        except ImportError:
            logger.info("sentence-transformers not installed; trying transformers AutoModel...")
        except Exception as err:
            logger.warning(f"Failed to load via sentence-transformers: {err}; falling back to transformers...")

        try:
            from transformers import AutoModel, AutoTokenizer

            if TORCH_AVAILABLE and torch:
                self._tokenizer = AutoTokenizer.from_pretrained(self.model_name)
                self._model = AutoModel.from_pretrained(self.model_name).to(self.device)
                self._model.eval()
                self._initialized = True
                logger.info(f"Loaded transformers model: {self.model_name}")
                return
        except Exception as err:
            logger.warning(f"Could not load HuggingFace embedding weights: {err}.")

        logger.info("Using fallback deterministic embedder for local/offline testing.")
        self._initialized = True

    def _mean_pooling(self, model_output, attention_mask):
        if not TORCH_AVAILABLE or not torch:
            return None
        token_embeddings = model_output[0]
        input_mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
        return torch.sum(token_embeddings * input_mask_expanded, 1) / torch.clamp(input_mask_expanded.sum(1), min=1e-9)

    def _fallback_embed(self, text: str) -> List[float]:
        """Deterministic hashing embedder for offline unit tests / fallback."""
        import hashlib
        import math

        vec = [0.0] * self.dimension
        if not text:
            return vec

        words = text.lower().split()
        for idx, word in enumerate(words):
            hash_bytes = hashlib.sha256(f"{word}_{idx}".encode("utf-8")).digest()
            for i in range(self.dimension):
                byte_val = hash_bytes[i % len(hash_bytes)]
                vec[i] += (byte_val / 255.0) - 0.5

        norm = math.sqrt(sum(x * x for x in vec))
        if norm > 0:
            vec = [x / norm for x in vec]
        return vec

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        if not self._initialized:
            self.load_model()

        if not texts:
            return []

        if self._sentence_transformer is not None:
            embeddings = self._sentence_transformer.encode(
                texts,
                batch_size=32,
                show_progress_bar=False,
                convert_to_numpy=True,
                normalize_embeddings=True,
            )
            return embeddings.tolist()

        if self._model is not None and self._tokenizer is not None and TORCH_AVAILABLE and torch:
            encoded_input = self._tokenizer(
                texts,
                padding=True,
                truncation=True,
                max_length=512,
                return_tensors="pt",
            ).to(self.device)
            with torch.no_grad():
                model_output = self._model(**encoded_input)
                sentence_embeddings = self._mean_pooling(model_output, encoded_input["attention_mask"])
                sentence_embeddings = torch.nn.functional.normalize(sentence_embeddings, p=2, dim=1)
                return sentence_embeddings.cpu().tolist()

        # Fallback embedder
        return [self._fallback_embed(text) for text in texts]

    def embed_query(self, text: str) -> List[float]:
        results = self.embed_documents([text])
        return results[0] if results else [0.0] * self.dimension

