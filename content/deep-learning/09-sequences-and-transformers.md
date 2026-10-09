---
title: Sequences, attention and transformers
summary: Recurrent networks and LSTMs for sequences, an honest LSTM forecast of currency volatility, attention built from scratch, how transformers and large language models work, and using pretrained models from Hugging Face.
minutes: 70
kind: lesson
colab: notebooks/07-09-sequences-and-transformers.ipynb
---

Prices, sensor readings, sentences and match histories are **sequences**: the order carries meaning. This lesson covers the two families of networks built for them: **recurrent networks**, which read one step at a time, and **transformers**, which look at the whole sequence at once through **attention**. Transformers power today's large language models, including Claude.

## Recurrent networks

A recurrent neural network (RNN) keeps a **hidden state** $h$, a vector summarising everything seen so far. At each step it combines the new input with the previous state, using the **same weights** at every step:

$$
h_t = \tanh(x_t W_x + h_{t-1} W_h + b)
$$

```python
import matplotlib.pyplot as plt
import numpy as np

rng = np.random.default_rng(0)
seq_len, n_in, n_hidden = 30, 1, 8
x = np.sin(np.linspace(0, 3 * np.pi, seq_len)).reshape(seq_len, n_in)   # one input series

W_x = rng.normal(0, 0.5, size=(n_in, n_hidden))
W_h = rng.normal(0, 0.3, size=(n_hidden, n_hidden))
b = np.zeros(n_hidden)

h = np.zeros(n_hidden)
states = []
for t in range(seq_len):
    h = np.tanh(x[t] @ W_x + h @ W_h + b)     # same weights at every step
    states.append(h)
states = np.array(states)

fig, axes = plt.subplots(2, 1, figsize=(7, 4), sharex=True)
axes[0].plot(x, "k")
axes[0].set_title("input sequence")
axes[1].imshow(states.T, aspect="auto", cmap="RdBu", vmin=-1, vmax=1)
axes[1].set_title("hidden state (8 units) over time")
axes[1].set_xlabel("time step")
fig.tight_layout()
plt.show()
print("final hidden state:", states[-1].round(3))
```

Training an RNN means backpropagating through every time step ("backpropagation through time"). Over long sequences the gradient passes through the same weights again and again, so it vanishes or explodes, the problem you saw in lesson 4, and plain RNNs struggle to remember anything for long.

**LSTMs** (long short-term memory networks) fix this with a separate **cell state** and **gates**: small sigmoid layers that decide what to forget, what to add and what to output at each step. The cell state can carry information across many steps with little change. In PyTorch it's one line: `nn.LSTM(input_size, hidden_size, batch_first=True)`.

## An LSTM forecast, judged honestly

The notebook's first part trains an LSTM to forecast the volatility of the course's EUR/USD series over the next 20 days, from the last 60 days of absolute returns. (Phase 6 showed the direction of this random walk is unpredictable, but its volatility clusters.) It trains on 2015–2019, uses 2020 for early stopping, and tests on 2021–2024, against three baselines:

```python static
class VolLSTM(nn.Module):
    def __init__(self, hidden=32):
        super().__init__()
        self.lstm = nn.LSTM(input_size=1, hidden_size=hidden, batch_first=True)
        self.head = nn.Linear(hidden, 1)

    def forward(self, x):                        # x: (batch, 60 days, 1 feature)
        out, _ = self.lstm(x)                    # out: (batch, 60, hidden)
        return self.head(out[:, -1]).squeeze(1)  # forecast from the last day's hidden state
```

Test-period error (RMSE, in percentage points of annual volatility; lower is better), from our run:

| Forecast | Test RMSE |
| --- | --- |
| Constant: the training-period average | 2.66 |
| Linear regression on log 5-, 20- and 60-day volatility | 2.43 |
| Persistence: next 20 days = last 20 days | 2.35 |
| LSTM on the last 60 days | 2.24 |

Recent volatility clearly carries information: every model beats the constant. The LSTM came out best, about 5% below persistence. Is that a real edge? The test period contains only about 50 non-overlapping 20-day windows, so a gap of that size could come from luck, or from the random seed. Before believing it, you'd rerun with several seeds and test on more series. Deep sequence models really pay off with lots of data and rich inputs: many related series, text, sensor channels.

Two details from the notebook worth copying: the time-based split **drops the last 20 training rows** before each boundary, because their targets overlap the next period (Phase 6's leakage lesson), and the LSTM predicts **standardised log-volatility**, which keeps the target well scaled.

## Attention

Instead of squeezing a whole sequence through one hidden state, **attention** lets every position look directly at every other position. Each position produces three vectors from its input:

- a **query**: "what am I looking for?"
- a **key**: "what do I contain?"
- a **value**: "what do I pass on if selected?"

A position's output is a weighted average of all the values, weighted by how well its query matches each key:

$$
\text{Attention}(Q, K, V) = \text{softmax}\!\left(\frac{QK^\top}{\sqrt{d}}\right) V
$$

Dividing by $\sqrt{d}$ (the vector length) keeps the scores from growing with dimension, which would make the softmax too peaked.

```python
import matplotlib.pyplot as plt
import numpy as np

def softmax(z):
    e = np.exp(z - z.max(axis=-1, keepdims=True))
    return e / e.sum(axis=-1, keepdims=True)

def attention(Q, K, V, mask=None):
    scores = Q @ K.T / np.sqrt(Q.shape[-1])
    if mask is not None:
        scores = np.where(mask, scores, -np.inf)    # masked positions get zero weight
    weights = softmax(scores)
    return weights @ V, weights

tokens = ["the", "striker", "scored", "because", "she", "was", "unmarked"]
rng = np.random.default_rng(0)
d = 16
X = rng.normal(size=(len(tokens), d))                       # stand-in token embeddings
W_q, W_k, W_v = (rng.normal(0, d ** -0.5, size=(d, d)) for _ in range(3))
Q, K, V = X @ W_q, X @ W_k, X @ W_v                         # learned projections in a real model

out, weights = attention(Q, K, V)
causal = np.tril(np.ones((len(tokens), len(tokens)), dtype=bool))   # position i sees 0..i
_, causal_weights = attention(Q, K, V, mask=causal)

fig, axes = plt.subplots(1, 2, figsize=(10, 4))
for ax, w, title in [(axes[0], weights, "full attention"), (axes[1], causal_weights, "causal (GPT-style)")]:
    ax.imshow(w, cmap="Blues", vmin=0)
    ax.set_xticks(range(len(tokens)), tokens, rotation=45)
    ax.set_yticks(range(len(tokens)), tokens)
    ax.set_title(title)
fig.tight_layout()
plt.show()
print("output shape:", out.shape, "| each row of weights sums to 1:", np.allclose(weights.sum(axis=1), 1))
```

The weights here come from random projections, so they're meaningless. In a trained model, the row for "she" would put high weight on "striker": attention is how a model links a pronoun to its noun, or a verb to its subject, however far apart they are. The **causal mask** stops each position seeing later ones, which is what a model generating text one token at a time needs.

## Transformers

A **transformer** layer combines:

1. **Multi-head self-attention**: several attention operations in parallel, each with its own learned $W_q, W_k, W_v$, so different heads can track different relationships.
2. A small **MLP** applied to each position separately.
3. **Residual connections** and **layer normalisation** around both, so deep stacks train stably (lesson 8's ResNet idea).

Attention by itself ignores order, so **positional encodings** are added to the token embeddings to tell the model where each token sits. Stack a few dozen of these layers, and you have the architecture behind:

- **BERT**-style *encoders*: full attention, trained to fill in masked words. Good for understanding text: classification, search, extraction.
- **GPT**-style *decoders*: causal attention, trained to predict the next token. Generate one token, append it, repeat. Scaled up enormously and fine-tuned to follow instructions, these become large language models such as Claude.

Text is first split into **tokens** (words or word pieces) by a **tokenizer**, and each token id is looked up in an embedding table: the same `nn.Embedding` you used for teams in lesson 10.

## Pretrained models with Hugging Face

Nobody trains a large transformer for a small project. You start from a **pretrained** model on the [Hugging Face Hub](https://huggingface.co/models), which hosts hundreds of thousands of them. The notebook's last part does two things with the course's 400 product reviews.

**Use a model as is.** This one was already fine-tuned for sentiment on movie reviews:

```python static
from transformers import pipeline

classifier = pipeline("sentiment-analysis", model="distilbert/distilbert-base-uncased-finetuned-sst-2-english")
print(classifier(["This keyboard is fantastic.", "It broke after two days."]))
# one dict per text, with a label (POSITIVE or NEGATIVE) and a confidence score
```

**Fine-tune a general model on your own labels.** The `Trainer` class runs the training loop:

```python static
from transformers import (AutoModelForSequenceClassification, AutoTokenizer, DataCollatorWithPadding,
                          Trainer, TrainingArguments)

checkpoint = "distilbert/distilbert-base-uncased"
tokenizer = AutoTokenizer.from_pretrained(checkpoint)
data = data.map(lambda batch: tokenizer(batch["review"], truncation=True), batched=True)
model = AutoModelForSequenceClassification.from_pretrained(checkpoint, num_labels=2)

args = TrainingArguments(output_dir="reviews-model", num_train_epochs=3, per_device_train_batch_size=16,
                         learning_rate=2e-5, eval_strategy="epoch", save_strategy="no", report_to="none")
trainer = Trainer(model=model, args=args, train_dataset=data["train"], eval_dataset=data["test"],
                  processing_class=tokenizer, data_collator=DataCollatorWithPadding(tokenizer),
                  compute_metrics=compute_metrics)
trainer.train()
```

Fine-tuning uses a small learning rate (here $2 \times 10^{-5}$) for the same reason as in lesson 8: you want to adjust the pretrained knowledge, not overwrite it. The course's synthetic reviews are easy (Phase 5's TF-IDF model already scored above 95%), so expect high accuracy from every approach. On real, messy text, fine-tuned transformers usually beat bag-of-words models clearly.

:::tip Fine-tune, prompt, or call an API?
For many text tasks today, you can also *prompt* a large language model through an API (such as Anthropic's API for Claude) instead of training anything. Prompting is fastest to try; fine-tuning a small model is cheaper and faster per prediction once you have labelled data. A sensible path is to prototype with prompting, then fine-tune if volume or cost demands it.
:::

## Practice

:::exercise seq-attention Scaled dot-product attention
Write `attention(Q, K, V, mask=None)` in NumPy for 2-D arrays: `Q` is `(n_queries, d)`, `K` is `(n_keys, d)` and `V` is `(n_keys, d_v)`. Compute the scores $QK^\top / \sqrt{d}$; where `mask` (a boolean array of shape `(n_queries, n_keys)`) is `False`, set the score to `-inf`; apply a row-wise softmax; and return the tuple `(weights @ V, weights)`.

@@starter
import numpy as np

def attention(Q, K, V, mask=None):
    return V, None

@@solution
import numpy as np

def attention(Q, K, V, mask=None):
    scores = Q @ K.T / np.sqrt(Q.shape[-1])
    if mask is not None:
        scores = np.where(mask, scores, -np.inf)
    scores = scores - scores.max(axis=1, keepdims=True)
    weights = np.exp(scores)
    weights = weights / weights.sum(axis=1, keepdims=True)
    return weights @ V, weights

@@tests
import numpy as np

def test_uniform_when_keys_equal():
    """Identical keys get equal weight, so the output is the mean value"""
    Q = np.array([[1.0, 2.0]])
    K = np.ones((3, 2))
    V = np.array([[0.0, 3.0], [3.0, 0.0], [6.0, 6.0]])
    out, w = attention(Q, K, V)
    assert np.allclose(w, 1 / 3) and np.allclose(out, [[3.0, 3.0]])

def test_matching_key_dominates():
    """A key that matches the query strongly gets almost all the weight"""
    Q = np.array([[10.0, 0.0]])
    K = np.array([[10.0, 0.0], [0.0, 10.0]])
    V = np.array([[1.0], [-1.0]])
    out, w = attention(Q, K, V)
    assert w[0, 0] > 0.999 and np.isclose(out[0, 0], 1.0, atol=1e-3)

def test_scaling_and_mask():
    """Scores are divided by sqrt(d), and masked keys get zero weight"""
    rng = np.random.default_rng(0)
    Q, K, V = rng.normal(size=(4, 8)), rng.normal(size=(4, 8)), rng.normal(size=(4, 3))
    mask = np.tril(np.ones((4, 4), dtype=bool))
    out, w = attention(Q, K, V, mask)
    scores = Q @ K.T / np.sqrt(8)
    expected = np.exp(scores[1, :2]) / np.exp(scores[1, :2]).sum()
    assert np.allclose(w[1, :2], expected) and np.allclose(w[1, 2:], 0)
    assert np.allclose(w[0], [1, 0, 0, 0]) and np.allclose(out[0], V[0])
:::

:::exercise seq-rnn An RNN forward pass
Write `rnn_forward(X, W_x, W_h, b)`. `X` has shape `(seq_len, n_in)`. Starting from a zero hidden state, apply $h_t = \tanh(x_t W_x + h_{t-1} W_h + b)$ at each step, and return all hidden states as an array of shape `(seq_len, n_hidden)`.

@@starter
import numpy as np

def rnn_forward(X, W_x, W_h, b):
    return np.zeros((len(X), W_h.shape[0]))

@@solution
import numpy as np

def rnn_forward(X, W_x, W_h, b):
    h = np.zeros(W_h.shape[0])
    states = []
    for x_t in X:
        h = np.tanh(x_t @ W_x + h @ W_h + b)
        states.append(h)
    return np.array(states)

@@tests
import numpy as np

def test_hand_example():
    """One hidden unit, values checkable by hand"""
    X = np.array([[1.0], [0.0], [2.0]])
    out = rnn_forward(X, np.array([[0.5]]), np.array([[1.0]]), np.array([0.0]))
    h1 = np.tanh(0.5)
    h2 = np.tanh(h1)
    h3 = np.tanh(1.0 + h2)
    assert out.shape == (3, 1) and np.allclose(out.ravel(), [h1, h2, h3])

def test_memory():
    """The final state depends on early inputs"""
    rng = np.random.default_rng(0)
    W_x, W_h, b = rng.normal(size=(2, 4)), rng.normal(0, 0.5, size=(4, 4)), np.zeros(4)
    X = rng.normal(size=(6, 2))
    changed = X.copy(); changed[0] += 1.0
    assert not np.allclose(rnn_forward(X, W_x, W_h, b)[-1], rnn_forward(changed, W_x, W_h, b)[-1])
:::

:::quiz seq-quiz Quick check
? Why do plain RNNs struggle with long sequences?
- [x] Gradients pass through the same weights at every step, so they vanish or explode
- [ ] They can only read sequences of 10 steps
- [ ] They don't share weights across time
> LSTMs add a cell state and gates to carry information further.

? In attention, why divide the scores by $\sqrt{d}$?
- [x] To stop the scores growing with vector length, which would make the softmax too sharp
- [ ] To make the weights sum to 1
- [ ] To save memory
> Dot products of long random vectors have large variance.

? What does a causal mask do?
- [x] Stops each position attending to later positions
- [ ] Removes padding tokens
- [ ] Makes attention faster
> Needed for models that generate text one token at a time.

? Your LSTM's test error is slightly worse than a linear regression on three hand-made features. What should you conclude?
- [x] Keep the simpler model: the LSTM adds complexity without improving out-of-sample results
- [ ] The LSTM is better because it's a deep learning model
- [ ] Train the LSTM on the test set
> Only out-of-sample comparisons with baselines count.
:::
