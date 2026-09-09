"""
Step 4: QLoRA fine-tune of Qwen2-VL-2B on this company's own verified labels.

Why QLoRA and not a plain LoRA or a full fine-tune: this deployment's GPU has
6GB total (~4.9GB free). The base model alone is ~4.4GB in float16, which
leaves nothing for activations or gradients — measured, not assumed. Loading
the frozen base in 4-bit drops it to ~1.5GB and leaves room to actually
train. Full fine-tuning a 2B model needs ~30GB and is not on the table here.

Hand-written training loop rather than transformers.Trainer: the loop is ~40
lines, and Trainer's argument names churn between releases (this machine runs
transformers 5.x), so the explicit version is both shorter to read and not a
moving target.

Prompt and image-resolution caps are imported from the production extraction
service so the adapter is trained against exactly the inputs it will see at
inference.

Run from the ai_backend directory:
    python finetune/train_lora.py
"""
import json
import math
import os
from pathlib import Path

import torch
from PIL import Image
from torch.utils.data import Dataset
from transformers import AutoProcessor, BitsAndBytesConfig, Qwen2VLForConditionalGeneration
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training

from app.services.extraction import EXTRACTION_PROMPT, MAX_PIXELS, MIN_PIXELS

BASE = Path(__file__).resolve().parent
DATASET = BASE / "dataset"
ADAPTER_OUT = BASE / "adapters" / "label-extraction-lora"

MODEL_PATH = "Qwen/Qwen2-VL-2B-Instruct"
EPOCHS = 6
GRAD_ACCUM = 8
LEARNING_RATE = 1e-4
WARMUP_FRACTION = 0.1
# 44 pages is a small set: a high LoRA rank has more capacity to memorise it
# than to learn from it. r=16 is the smallest rank that still gave a falling
# validation loss here.
LORA_RANK = 16


class LabelDataset(Dataset):
    """Each item is one label page: the image, the production prompt, and the
    verified JSON the model should emit for it."""

    def __init__(self, path: Path, processor):
        self.rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
        self.processor = processor

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, index):
        row = self.rows[index]
        image = Image.open(row["image"]).convert("RGB")

        user_turn = [{
            "role": "user",
            "content": [{"type": "image"}, {"type": "text", "text": row["prompt"]}],
        }]
        full_turns = user_turn + [{
            "role": "assistant",
            "content": [{"type": "text", "text": row["target"]}],
        }]

        full_text = self.processor.apply_chat_template(full_turns, tokenize=False)
        prompt_text = self.processor.apply_chat_template(user_turn, tokenize=False, add_generation_prompt=True)

        batch = self.processor(text=[full_text], images=[image], return_tensors="pt")
        prompt_len = self.processor(text=[prompt_text], images=[image], return_tensors="pt").input_ids.shape[1]

        # Train on the answer only. Without this the loss is dominated by the
        # prompt — the same ~900 tokens on every example — and the model would
        # spend its capacity learning to recite the instructions back.
        labels = batch.input_ids.clone()
        labels[:, :prompt_len] = -100
        labels[labels == self.processor.tokenizer.pad_token_id] = -100
        batch["labels"] = labels

        # Returned exactly as the processor produced it. Only input_ids /
        # attention_mask / labels carry a batch dimension; pixel_values is a
        # flat (patches, features) tensor and image_grid_thw is (images, 3),
        # neither of which is batched. Indexing or unsqueezing everything
        # uniformly corrupts those two and the vision merger then fails on a
        # split size that doesn't match the grid.
        return dict(batch)


def collate(features):
    """Batch size is 1 — one ~2,500-token image sequence is already a full
    step on this GPU — so the processor's own output is the batch."""
    return features[0]


def supervised_loss(model, batch):
    """Loss over the answer tokens, computing logits for only those positions.

    Qwen2-VL's vocabulary is ~152k, so a full-sequence logits tensor for a
    ~2,500-token page is ~750MB in fp16 and ~1.5GB once upcast for the loss —
    measured as the single largest allocation in the step, larger than the
    model itself. Every position before the answer is masked to -100 and
    contributes nothing, so `logits_to_keep` trims the head to the supervised
    suffix (~660 positions here). The resulting loss is identical; only the
    discarded work is gone.
    """
    labels = batch["labels"]
    supervised = (labels[0] != -100).nonzero()
    if len(supervised) == 0:
        raise ValueError("Example has no supervised tokens; the prompt mask is wrong.")

    # +1 so the position immediately before the first answer token is kept:
    # that is the one whose logits predict it.
    keep = labels.shape[1] - int(supervised[0]) + 1
    inputs = {key: value for key, value in batch.items() if key != "labels"}

    logits = model(**inputs, logits_to_keep=keep).logits
    tail = labels[:, -keep:]

    # Standard causal shift: position i predicts token i+1. Deliberately not
    # upcast to float32 first: cross_entropy already accumulates its
    # log_softmax in float internally, so an explicit .float() here only
    # materialises a second ~400MB copy of the logits plus a gradient the
    # same size — which is what still pushed this step over the card.
    shift_logits = logits[:, :-1, :]
    shift_labels = tail[:, 1:]
    return torch.nn.functional.cross_entropy(
        shift_logits.reshape(-1, shift_logits.size(-1)),
        shift_labels.reshape(-1),
        ignore_index=-100,
    )


def freeze_vision_tower(model):
    """Runs the vision encoder under no_grad and returns how many parameters
    that froze.

    LoRA is attached to the language model only, so no trainable parameter
    sits upstream of the vision tower and its activations are never needed
    for a backward pass — but autograd stores them anyway. At this dataset's
    resolution one page is ~4,960 image patches, and holding the encoder's
    per-block activations for that many patches is what actually exhausted
    this 6GB card (the OOM lands in the ViT's MLP, before the language model
    is even reached). Skipping that storage is mathematically identical for
    the gradients that are computed, and is the difference between training
    running here and not running at all.
    """
    visual = getattr(getattr(model, "model", model), "visual", None) or getattr(model, "visual", None)
    if visual is None:
        raise SystemExit("Could not locate the vision tower to freeze; refusing to train blind.")

    frozen = 0
    for parameter in visual.parameters():
        parameter.requires_grad_(False)
        frozen += parameter.numel()

    inner_forward = visual.forward

    def no_grad_forward(*args, **kwargs):
        with torch.no_grad():
            return inner_forward(*args, **kwargs)

    visual.forward = no_grad_forward
    return frozen


@torch.no_grad()
def evaluate(model, dataset, device):
    model.eval()
    losses = []
    for index in range(len(dataset)):
        batch = collate([dataset[index]])
        batch = {key: value.to(device) for key, value in batch.items()}
        losses.append(supervised_loss(model, batch).item())
    model.train()
    return sum(losses) / len(losses)


def main() -> None:
    if not torch.cuda.is_available():
        raise SystemExit("Training needs the CUDA GPU; none is available.")
    device = "cuda"

    processor = AutoProcessor.from_pretrained(MODEL_PATH, min_pixels=MIN_PIXELS, max_pixels=MAX_PIXELS)

    print("Loading base model in 4-bit...")
    model = Qwen2VLForConditionalGeneration.from_pretrained(
        MODEL_PATH,
        quantization_config=BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True,
            bnb_4bit_compute_dtype=torch.float16,
        ),
        device_map={"": 0},
        # Memory-efficient attention. Eager attention materialises a full
        # patches x patches matrix in the vision tower (~4,960 patches per
        # page here), which does not fit alongside the rest of training.
        attn_implementation="sdpa",
    )
    frozen = freeze_vision_tower(model)
    print(f"vision tower frozen and run under no_grad ({frozen/1e6:.0f}M params)")
    model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)

    # Enabled explicitly, and non-reentrant. Without this the language model
    # keeps every layer's activations for a ~2,500-token sequence (measured:
    # several GB, which OOMs this card), whereas checkpointing keeps only the
    # layer boundaries and recomputes the rest in the backward pass.
    # use_reentrant=False is required rather than optional here: the frozen
    # vision tower hands the language model inputs that carry no grad, and the
    # reentrant implementation silently declines to checkpoint that case.
    model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})
    model.enable_input_require_grads()
    model.config.use_cache = False

    # Adapters on the language model's projections only. The vision tower is
    # left frozen: the failures this fine-tune targets (field confusion,
    # runaway ingredient lists, wrong JSON shape) are language-side, and
    # training the encoder as well does not fit in the VRAM budget above.
    model = get_peft_model(model, LoraConfig(
        r=LORA_RANK,
        lora_alpha=LORA_RANK * 2,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    ))
    model.print_trainable_parameters()

    # Not cosmetic, and not safe to leave to the loop below: a decoder layer
    # only takes its checkpointing path when `self.training` is true, so with
    # the model still in eval mode every gradient_checkpointing setting above
    # is silently inert and the step OOMs on this card. Measured: 3.9GB peak
    # in train mode versus an out-of-memory failure without it.
    model.train()

    train_set = LabelDataset(DATASET / "train.jsonl", processor)
    val_set = LabelDataset(DATASET / "val.jsonl", processor)
    print(f"{len(train_set)} training pages, {len(val_set)} validation pages")

    import bitsandbytes as bnb
    optimizer = bnb.optim.AdamW8bit(
        [p for p in model.parameters() if p.requires_grad], lr=LEARNING_RATE, weight_decay=0.01
    )
    steps_per_epoch = math.ceil(len(train_set) / GRAD_ACCUM)
    total_steps = steps_per_epoch * EPOCHS
    scheduler = torch.optim.lr_scheduler.OneCycleLR(
        optimizer, max_lr=LEARNING_RATE, total_steps=total_steps,
        pct_start=WARMUP_FRACTION, anneal_strategy="cos",
    )

    baseline = evaluate(model, val_set, device)
    print(f"validation loss before training: {baseline:.4f}", flush=True)

    best = baseline
    ADAPTER_OUT.mkdir(parents=True, exist_ok=True)
    order = list(range(len(train_set)))
    model.train()

    for epoch in range(1, EPOCHS + 1):
        torch.manual_seed(epoch)
        epoch_losses = []
        for position, index in enumerate(order, start=1):
            batch = collate([train_set[index]])
            batch = {key: value.to(device) for key, value in batch.items()}
            loss = supervised_loss(model, batch)
            (loss / GRAD_ACCUM).backward()
            epoch_losses.append(loss.item())

            if position % GRAD_ACCUM == 0 or position == len(order):
                torch.nn.utils.clip_grad_norm_([p for p in model.parameters() if p.requires_grad], 1.0)
                optimizer.step()
                scheduler.step()
                optimizer.zero_grad(set_to_none=True)

        val_loss = evaluate(model, val_set, device)
        train_loss = sum(epoch_losses) / len(epoch_losses)
        print(f"epoch {epoch}/{EPOCHS}  train {train_loss:.4f}  val {val_loss:.4f}", flush=True)

        # Keep the epoch that generalises best, not the last one. With 38
        # training pages the model starts memorising well before the final
        # epoch, and the last checkpoint is usually not the best one.
        if val_loss < best:
            best = val_loss
            model.save_pretrained(str(ADAPTER_OUT))
            processor.save_pretrained(str(ADAPTER_OUT))
            print(f"  saved new best adapter (val {val_loss:.4f})", flush=True)

    print(f"\nDone. Best validation loss {best:.4f} (baseline {baseline:.4f}).")
    if best < baseline:
        print(f"Adapter written to {ADAPTER_OUT}")
        print("Point the service at it with LABEL_LORA_ADAPTER=<that path>.")
    else:
        print("No epoch beat the untrained baseline — nothing was saved worth loading.")


if __name__ == "__main__":
    main()
