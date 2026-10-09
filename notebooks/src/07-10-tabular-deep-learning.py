# %% [markdown]
# # Deep learning on tabular data: team embeddings
#
# Companion notebook for **Phase 7, lesson 10** of the PyPath course. Runs fine on a CPU.
#
# Neural networks can learn an **embedding** (a small vector of numbers) for each value of a
# categorical feature, such as a team. This notebook shows that the Poisson goal model from Phase 6
# *is* a tiny embedding network, then tries a bigger, more flexible one, and compares both with the
# market on the 2024-25 season.

# %%
import copy

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import torch
from scipy import stats
from sklearn.metrics import log_loss
from torch import nn

DATA_URL = "https://raw.githubusercontent.com/itschu/python-course-beginner-to-advanced/main/public/data/"
torch.manual_seed(0)

matches = pd.read_csv(DATA_URL + "matches.csv", parse_dates=["Date"])
teams = sorted(matches["HomeTeam"].unique())
team_id = {team: i for i, team in enumerate(teams)}
matches["h"], matches["a"] = matches["HomeTeam"].map(team_id), matches["AwayTeam"].map(team_id)
LABELS = ["A", "D", "H"]

train = matches[matches["Season"] < "2024-25"]
test = matches[matches["Season"] == "2024-25"]
implied = 1 / test[["AvgA", "AvgD", "AvgH"]].to_numpy()
market_loss = log_loss(test["FTR"], implied / implied.sum(axis=1, keepdims=True), labels=LABELS)
print(f"{len(train)} training matches, {len(test)} test matches; market log loss {market_loss:.4f}")


def tensors(df):
    return torch.tensor(df["h"].to_numpy()), torch.tensor(df["a"].to_numpy())


def outcome_probs(lam_home, lam_away, max_goals=10):
    """Away/draw/home probabilities from two independent Poisson goal rates."""
    g = np.arange(max_goals + 1)
    rows = []
    for lh, la in zip(lam_home, lam_away):
        grid = np.outer(stats.poisson(lh).pmf(g), stats.poisson(la).pmf(g))
        grid /= grid.sum()
        rows.append([np.triu(grid, 1).sum(), np.trace(grid), np.tril(grid, -1).sum()])
    return np.array(rows)

# %% [markdown]
# ## 1. The Poisson model as a neural network
#
# Each team gets a one-number "attack" embedding and a one-number "defence" embedding. The home
# side's log expected goals are `base + home advantage + attack[home] − defence[away]`, exactly as
# in Phase 6. Training minimises the Poisson negative log-likelihood, weighting recent matches more
# (time decay ξ = 0.004 per day), with a little weight decay on the embeddings.

# %%
class PoissonNet(nn.Module):
    def __init__(self, n_teams):
        super().__init__()
        self.attack = nn.Embedding(n_teams, 1)
        self.defence = nn.Embedding(n_teams, 1)
        nn.init.zeros_(self.attack.weight)
        nn.init.zeros_(self.defence.weight)
        self.base = nn.Parameter(torch.tensor(0.3))
        self.home_adv = nn.Parameter(torch.tensor(0.2))

    def forward(self, h, a):
        log_home = self.base + self.home_adv + (self.attack(h) - self.defence(a)).squeeze(1)
        log_away = self.base + (self.attack(a) - self.defence(h)).squeeze(1)
        return log_home, log_away


def fit_poisson(df, decay=0.004, l2=1e-3, steps=400):
    model = PoissonNet(len(teams))
    optimizer = torch.optim.Adam(model.parameters(), lr=0.05)
    h, a = tensors(df)
    home_goals = torch.tensor(df["FTHG"].to_numpy(), dtype=torch.float32)
    away_goals = torch.tensor(df["FTAG"].to_numpy(), dtype=torch.float32)
    age = (df["Date"].max() - df["Date"]).dt.days.to_numpy()
    w = torch.tensor(np.exp(-decay * age), dtype=torch.float32)
    nll = nn.PoissonNLLLoss(log_input=True, reduction="none")
    for _ in range(steps):
        log_home, log_away = model(h, a)
        loss = ((nll(log_home, home_goals) + nll(log_away, away_goals)) * w).sum() / w.sum()
        loss = loss + l2 * (model.attack.weight.pow(2).sum() + model.defence.weight.pow(2).sum())
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
    return model


poisson_net = fit_poisson(train)
with torch.no_grad():
    log_home, log_away = poisson_net(*tensors(test))
static_loss = log_loss(test["FTR"], outcome_probs(log_home.exp().numpy(), log_away.exp().numpy()), labels=LABELS)
base_rates = np.tile([(train["FTR"] == label).mean() for label in LABELS], (len(test), 1))
print(f"PoissonNet: {sum(p.numel() for p in poisson_net.parameters())} parameters")
print(f"home advantage: {poisson_net.home_adv.item():.3f} (multiplies home expected goals by {np.exp(poisson_net.home_adv.item()):.2f})")
print(f"fitted once on 2022-24, test log loss {static_loss:.4f}; base rates {log_loss(test['FTR'], base_rates, labels=LABELS):.4f}")

# %%
attack = poisson_net.attack.weight.detach().numpy().ravel()
defence = poisson_net.defence.weight.detach().numpy().ravel()
plt.figure(figsize=(6, 5))
plt.scatter(attack, defence)
for t, x, y in zip(teams, attack, defence):
    plt.annotate(t.split()[0], (x, y), fontsize=7)
plt.xlabel("attack embedding")
plt.ylabel("defence embedding")
plt.title("Learned team embeddings")
plt.show()

# %% [markdown]
# Fitted once and used for a whole season, the model does **worse than base rates**: team
# strengths drift between and during seasons, so last season's ratings go stale. The fix, as in
# Phase 6, is **walk-forward**: refit before each month using every match played so far.

# %%
def walk_forward(predict, season):
    """Refit before each month of `season`, using only earlier matches."""
    rows = matches[matches["Season"] == season]
    parts = []
    for _, month in rows.groupby(rows["Date"].dt.to_period("M")):
        past = matches[matches["Date"] < month["Date"].min()]
        parts.append(pd.DataFrame(predict(past, month), index=month.index, columns=LABELS))
    return pd.concat(parts)


def poisson_predict(past, month):
    model = fit_poisson(past)
    with torch.no_grad():
        log_home, log_away = model(*tensors(month))
    return outcome_probs(log_home.exp().numpy(), log_away.exp().numpy())


poisson_wf = walk_forward(poisson_predict, "2024-25")
poisson_loss = log_loss(test["FTR"], poisson_wf.loc[test.index], labels=LABELS)
print(f"PoissonNet, walk-forward: test log loss {poisson_loss:.4f}")

# %% [markdown]
# That's the same score as Phase 6's scikit-learn `PoissonRegressor` (1.0440): it's the same model,
# written as a neural network.
#
# ## 2. A flexible embedding network
#
# What if we let the network learn richer team representations: an 8-number embedding per team,
# fed through an MLP that outputs home/draw/away directly? It's trained walk-forward too, with the
# same time-decay weights. The number of training epochs is chosen by walk-forward log loss on
# the 2023-24 season, before touching 2024-25.

# %%
class EmbeddingMLP(nn.Module):
    def __init__(self, n_teams, dim=8):
        super().__init__()
        self.team = nn.Embedding(n_teams, dim)
        self.mlp = nn.Sequential(nn.Linear(2 * dim, 32), nn.ReLU(), nn.Dropout(0.2), nn.Linear(32, 3))

    def forward(self, h, a):
        return self.mlp(torch.cat([self.team(h), self.team(a)], dim=1))   # logits for A, D, H


def mlp_predictor(epochs, decay=0.004):
    def predict(past, month):
        torch.manual_seed(0)
        model = EmbeddingMLP(len(teams))
        optimizer = torch.optim.AdamW(model.parameters(), lr=0.01, weight_decay=1e-2)
        y = torch.tensor(past["FTR"].map({"A": 0, "D": 1, "H": 2}).to_numpy())
        w = torch.tensor(np.exp(-decay * (month["Date"].min() - past["Date"]).dt.days.to_numpy()), dtype=torch.float32)
        for _ in range(epochs):
            model.train()
            loss = (nn.functional.cross_entropy(model(*tensors(past)), y, reduction="none") * w).sum() / w.sum()
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
        model.eval()
        with torch.no_grad():
            return torch.softmax(model(*tensors(month)), dim=1).numpy()
    return predict


valid = matches[matches["Season"] == "2023-24"]
valid_base = np.tile([(matches[matches["Season"] == "2022-23"]["FTR"] == label).mean() for label in LABELS], (len(valid), 1))
print(f"2023-24 validation: base rates {log_loss(valid['FTR'], valid_base, labels=LABELS):.4f}")
scores = {}
for epochs in [5, 20, 50, 100]:
    preds = walk_forward(mlp_predictor(epochs), "2023-24")
    scores[epochs] = log_loss(valid["FTR"], preds.loc[valid.index], labels=LABELS)
    print(f"  EmbeddingMLP, {epochs:3d} epochs: {scores[epochs]:.4f}")
best_epochs = min(scores, key=scores.get)

mlp_wf = walk_forward(mlp_predictor(best_epochs), "2024-25")
mlp_loss = log_loss(test["FTR"], mlp_wf.loc[test.index], labels=LABELS)
print(f"EmbeddingMLP ({best_epochs} epochs), walk-forward: test log loss {mlp_loss:.4f}")

# %% [markdown]
# ## 3. Compare

# %%
for name, value in sorted({
    "base rates": log_loss(test["FTR"], base_rates, labels=LABELS),
    "EmbeddingMLP (flexible)": mlp_loss,
    "PoissonNet (structured)": poisson_loss,
    "market": market_loss,
}.items(), key=lambda kv: kv[1]):
    print(f"{name:>24}: {value:.4f}")

# %% [markdown]
# The flexible network never beats plain base rates: more epochs just let it memorise the
# training matches, and even its best setting learns nothing useful from about 1,000 noisy
# results. The structured network, with 42 parameters arranged the way goals actually arise
# (attack against defence), beats base rates clearly. With small, noisy data, **structure beats
# flexibility**. Embedding networks shine with many categories and lots of data: thousands of
# products, stores or users, where one-hot features become unwieldy.
#
# **Exercise (open-ended).** Give `PoissonNet` 2-dimensional embeddings (change both
# `nn.Embedding(n_teams, 1)` to `nn.Embedding(n_teams, 2)` and replace `.squeeze(1)` with
# `.sum(1)` in `forward`). Does the extra capacity help on 2024-25?
