# %% [markdown]
# # Sequences, attention and transformers
#
# Companion notebook for **Phase 7, lesson 9** of the PyPath course.
#
# 1. An LSTM that forecasts currency volatility, compared honestly with simple baselines.
# 2. Attention, written from scratch and checked against PyTorch.
# 3. Pretrained transformers from Hugging Face: zero-shot sentiment, then fine-tuning.
#
# Choose *Runtime → Change runtime type → T4 GPU* first (part 3 needs it).

# %%
import copy
import math

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import torch
import torch.nn.functional as F
from sklearn.linear_model import LinearRegression
from torch import nn

DATA_URL = "https://raw.githubusercontent.com/itschu/python-course-beginner-to-advanced/main/public/data/"
device = "cuda" if torch.cuda.is_available() else "cpu"
torch.manual_seed(0)


def check(name, condition):
    try:
        ok = bool(condition())
    except Exception as error:
        ok, name = False, f"{name} ({type(error).__name__})"
    print(("✓ " if ok else "✗ ") + name)

# %% [markdown]
# ## Part 1: an LSTM for volatility
#
# Lesson 7 of Phase 6 showed that the course's EUR/USD series is a random walk, so direction is
# unpredictable, but volatility clusters. The task: from the last 60 days of absolute returns,
# forecast the (annualised) volatility of the **next 20 days**.
#
# Splits by time: train 2015–2019, validate on 2020, test on 2021–2024. Each target looks 20 days
# ahead, so the last 20 rows before each boundary are dropped (they'd overlap the next period).

# %%
fx = pd.read_csv(DATA_URL + "eurusd_daily.csv", parse_dates=["Date"], index_col="Date")
r = np.log(fx["Close"]).diff().dropna()
WINDOW, HORIZON, ANNUAL = 60, 20, np.sqrt(252) * 100     # volatility in % per year

future_vol = r.rolling(HORIZON).std().shift(-HORIZON) * ANNUAL
past_vol = pd.DataFrame({f"vol_{w}d": r.rolling(w).std() * ANNUAL for w in (5, 20, 60)})
abs_returns = (r.abs() * 100).to_numpy(np.float32)

rows = np.array([t for t in range(WINDOW - 1, len(r)) if not np.isnan(future_vol.iloc[t])])
X = np.stack([abs_returns[t - WINDOW + 1:t + 1] for t in rows])[:, :, None]   # (samples, 60 days, 1 feature)
y = future_vol.iloc[rows].to_numpy(np.float32)
past = past_vol.iloc[rows].to_numpy()
dates = r.index[rows]

train = np.flatnonzero(dates < "2020-01-01")[:-HORIZON]
val = np.flatnonzero((dates >= "2020-01-01") & (dates < "2021-01-01"))[:-HORIZON]
test = np.flatnonzero(dates >= "2021-01-01")
print("sequences:", X.shape, "| train/val/test:", len(train), len(val), len(test))

# %% [markdown]
# ### Baselines first
#
# Always start with something simple. Three baselines: the training-period average (a constant),
# the last 20 days' volatility ("persistence"), and a linear regression on the log of the past
# 5-, 20- and 60-day volatilities.

# %%
def rmse(pred, idx):
    return float(np.sqrt(np.mean((pred - y[idx]) ** 2)))

linear = LinearRegression().fit(np.log(past[train]), np.log(y[train]))
results = {
    "constant (training mean)": rmse(np.full(len(test), y[train].mean()), test),
    "persistence (last 20 days)": rmse(past[test, 1], test),
    "linear regression": rmse(np.exp(linear.predict(np.log(past[test]))), test),
}
for name, value in results.items():
    print(f"{name:>28}: test RMSE {value:.3f} percentage points")

# %% [markdown]
# ### The LSTM
#
# An **LSTM** reads the sequence one day at a time, updating a hidden state (its memory) at each
# step. Its gates decide what to keep and what to forget, which lets it carry information across
# long sequences. We use the hidden state after the last day to make the forecast.
#
# Inputs are scaled by the training mean, and the model predicts standardised log-volatility.

# %%
scale = X[train].mean()
mu, sd = np.log(y[train]).mean(), np.log(y[train]).std()
X_t = torch.tensor(X / scale).to(device)
y_t = torch.tensor((np.log(y) - mu) / sd, dtype=torch.float32).to(device)


class VolLSTM(nn.Module):
    def __init__(self, hidden=32):
        super().__init__()
        self.lstm = nn.LSTM(input_size=1, hidden_size=hidden, batch_first=True)
        self.head = nn.Linear(hidden, 1)

    def forward(self, x):                      # x: (batch, days, features)
        out, _ = self.lstm(x)                  # out: (batch, days, hidden)
        return self.head(out[:, -1]).squeeze(1)   # use the last day's hidden state


model = VolLSTM().to(device)
optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
loss_fn = nn.MSELoss()
best_loss, best_epoch, best_state = float("inf"), 0, None
train_idx = torch.tensor(train, device=device)
for epoch in range(60):
    model.train()
    for batch in train_idx[torch.randperm(len(train_idx), device=device)].split(64):
        loss = loss_fn(model(X_t[batch]), y_t[batch])
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
    model.eval()
    with torch.no_grad():
        val_loss = loss_fn(model(X_t[val]), y_t[val]).item()
    if val_loss < best_loss:
        best_loss, best_epoch, best_state = val_loss, epoch, copy.deepcopy(model.state_dict())
    elif epoch - best_epoch >= 8:
        break
model.load_state_dict(best_state)
with torch.no_grad():
    lstm_pred = np.exp(model(X_t[test]).cpu().numpy() * sd + mu)
results["LSTM"] = rmse(lstm_pred, test)
print(f"stopped after {epoch + 1} epochs (best: epoch {best_epoch})")
for name, value in results.items():
    print(f"{name:>28}: test RMSE {value:.3f}")

# %%
plt.figure(figsize=(10, 3.5))
plt.plot(dates[test], y[test], label="actual next-20-day volatility", lw=1)
plt.plot(dates[test], past[test, 1], label="persistence", lw=1, alpha=0.7)
plt.plot(dates[test], lstm_pred, label="LSTM", lw=1)
plt.ylabel("% per year")
plt.legend()
plt.show()

# %% [markdown]
# Compare the RMSEs above. Persistence and the linear model both beat the constant, so recent
# volatility does carry information. When we ran this, the LSTM came out best, about 5% below
# persistence. Before believing it, remember the test period holds only about 50 non-overlapping
# 20-day windows: a gap this size can come from luck, from the random seed, or from the GPU you
# happen to get. Rerun with a few seeds, and test on more series, before claiming an edge. Deep
# sequence models really earn their keep with lots of data and rich inputs (many related series,
# text, sensor channels).

# %% [markdown]
# ## Part 2: attention from scratch
#
# Attention lets every position in a sequence look at every other position. Each position
# produces a **query**, a **key** and a **value**; the output for a position is a weighted average
# of all values, with weights from how well its query matches each key:
#
# $$\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^\top}{\sqrt{d}}\right) V$$

# %%
def attention(Q, K, V, causal=False):
    d = Q.shape[-1]
    scores = Q @ K.transpose(-2, -1) / math.sqrt(d)            # (…, n_queries, n_keys)
    if causal:                                                 # a position can't see the future
        n = scores.shape[-1]
        mask = torch.triu(torch.ones(n, n, dtype=torch.bool, device=scores.device), diagonal=1)
        scores = scores.masked_fill(mask, float("-inf"))
    weights = torch.softmax(scores, dim=-1)
    return weights @ V, weights


Q, K, V = torch.randn(2, 5, 8), torch.randn(2, 5, 8), torch.randn(2, 5, 8)   # batch 2, 5 tokens, 8 dims
out, weights = attention(Q, K, V)
print("output:", tuple(out.shape), "| each row of weights sums to 1:", torch.allclose(weights.sum(-1), torch.ones(2, 5)))
print("matches PyTorch:", torch.allclose(out, F.scaled_dot_product_attention(Q, K, V), atol=1e-6))
out_causal, w_causal = attention(Q, K, V, causal=True)
print("matches PyTorch (causal):", torch.allclose(out_causal, F.scaled_dot_product_attention(Q, K, V, is_causal=True), atol=1e-6))
print("causal weights for one sequence:\n", w_causal[0].round(decimals=2))

# %% [markdown]
# A **transformer** layer is: multi-head self-attention (several attention operations in parallel,
# on learned projections of the input), then a small MLP applied to each position, each wrapped
# with a residual connection and layer normalisation. Stack a dozen or more of these, train on a
# huge amount of text, and you get models like BERT and GPT. PyTorch has them built in:

# %%
layer = nn.TransformerEncoderLayer(d_model=64, nhead=4, dim_feedforward=128, batch_first=True)
encoder = nn.TransformerEncoder(layer, num_layers=2)
tokens = torch.randn(3, 10, 64)                     # batch of 3 sequences, 10 tokens, 64 dims
print("encoder output:", tuple(encoder(tokens).shape))
print("parameters:", sum(p.numel() for p in encoder.parameters()))

# %% [markdown]
# **Exercise 1.** Write `positional_encoding(n_positions, d)`: the sinusoidal encoding from the
# original transformer paper, returned as a tensor of shape `(n_positions, d)` (d even), with
# `PE[pos, 2i] = sin(pos / 10000^(2i/d))` and `PE[pos, 2i+1] = cos(pos / 10000^(2i/d))`.
# Attention itself ignores order; adding these to the inputs tells the model where each token is.

# %%
def positional_encoding(n_positions, d):
    ...  # YOUR CODE HERE

# %%
check("Exercise 1", lambda: positional_encoding(50, 16).shape == (50, 16)
      and torch.allclose(positional_encoding(50, 16)[0], torch.tensor([0.0, 1.0] * 8))
      and abs(positional_encoding(50, 16)[3, 2].item() - math.sin(3 / 10000 ** (2 / 16))) < 1e-6)

# %% [markdown]
# ## Part 3: pretrained transformers with Hugging Face
#
# Training a transformer from scratch needs enormous amounts of text. In practice you start from
# a **pretrained** model on the [Hugging Face Hub](https://huggingface.co/models). The
# `transformers` library is preinstalled in Colab.
#
# ### Zero-shot: use a model someone else fine-tuned
#
# This DistilBERT model was fine-tuned on movie-review sentiment. Let's try it, untouched, on the
# course's product reviews.

# %%
from transformers import pipeline

reviews = pd.read_csv(DATA_URL + "reviews.csv")
classifier = pipeline("sentiment-analysis", model="distilbert/distilbert-base-uncased-finetuned-sst-2-english",
                      device=0 if device == "cuda" else -1)
print(classifier(["This keyboard is fantastic.", "It broke after two days."]))

predictions = classifier(reviews["review"].tolist(), batch_size=32)
predicted = ["positive" if p["label"] == "POSITIVE" else "negative" for p in predictions]
print(f"zero-shot accuracy on 400 product reviews: {np.mean(np.array(predicted) == reviews['sentiment']):.3f}")

# %% [markdown]
# ### Fine-tuning on your own labels
#
# When no ready-made model fits, fine-tune a general pretrained model on your own labelled data.
# The `Trainer` class runs the training loop for you.

# %%
# Colab includes transformers; this makes sure the training extras are installed too.
import importlib.util
import subprocess
import sys

if importlib.util.find_spec("accelerate") is None or importlib.util.find_spec("datasets") is None:
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "accelerate", "datasets"], check=True)

# %%
from datasets import Dataset as HFDataset
from transformers import (AutoModelForSequenceClassification, AutoTokenizer, DataCollatorWithPadding,
                          Trainer, TrainingArguments)

checkpoint = "distilbert/distilbert-base-uncased"
tokenizer = AutoTokenizer.from_pretrained(checkpoint)
print(tokenizer("Overall this keyboard is great")["input_ids"])     # text -> token ids

data = HFDataset.from_pandas(reviews.assign(label=(reviews["sentiment"] == "positive").astype(int))[["review", "label"]])
data = data.train_test_split(test_size=0.25, seed=0)
data = data.map(lambda batch: tokenizer(batch["review"], truncation=True), batched=True)

model = AutoModelForSequenceClassification.from_pretrained(checkpoint, num_labels=2)


def compute_metrics(eval_pred):
    logits, labels = eval_pred
    return {"accuracy": float((logits.argmax(axis=-1) == labels).mean())}


args = TrainingArguments(
    output_dir="reviews-model",
    num_train_epochs=3,
    per_device_train_batch_size=16,
    learning_rate=2e-5,
    eval_strategy="epoch",
    save_strategy="no",
    logging_steps=10,
    report_to="none",
)
trainer = Trainer(model=model, args=args, train_dataset=data["train"], eval_dataset=data["test"],
                  processing_class=tokenizer, data_collator=DataCollatorWithPadding(tokenizer),
                  compute_metrics=compute_metrics)
trainer.train()
print(trainer.evaluate())

# %% [markdown]
# These synthetic reviews are easy (in Phase 5, TF-IDF with logistic regression already scored
# above 95%), so all approaches do well. On real, messy text, fine-tuned transformers usually
# beat bag-of-words models clearly. That gap is why they took over natural language processing.
#
# ## Solutions

# %%
def positional_encoding(n_positions, d):
    pos = torch.arange(n_positions, dtype=torch.float32)[:, None]
    i = torch.arange(0, d, 2, dtype=torch.float32)[None, :]
    angles = pos / 10000 ** (i / d)
    pe = torch.zeros(n_positions, d)
    pe[:, 0::2] = torch.sin(angles)
    pe[:, 1::2] = torch.cos(angles)
    return pe


check("Exercise 1", lambda: positional_encoding(50, 16).shape == (50, 16)
      and torch.allclose(positional_encoding(50, 16)[0], torch.tensor([0.0, 1.0] * 8))
      and abs(positional_encoding(50, 16)[3, 2].item() - math.sin(3 / 10000 ** (2 / 16))) < 1e-6)
