---
title: Visualising data with Matplotlib
summary: Line, bar, histogram and scatter charts, multi-panel figures, and the principles of charts that tell the truth.
minutes: 55
kind: lesson
---

A good chart shows in a second what a table hides. You'll use charts to explore data, to check models, and to convince other people. **Matplotlib** is Python's foundational plotting library; pandas and most other plotting tools are built on it.

Charts appear below each code cell. In your own projects, `plt.show()` opens a window (or displays inline in a notebook), and `fig.savefig("chart.png", dpi=150)` saves the image.

## Figures and axes

Always use the "object-oriented" style: create a **figure** (the whole image) and one or more **axes** (the plotting areas), then call methods on the axes:

```python
import matplotlib.pyplot as plt
import pandas as pd

fx = pd.read_csv("data/eurusd_daily.csv", parse_dates=["Date"])

fig, ax = plt.subplots(figsize=(8, 3.5))
ax.plot(fx["Date"], fx["Close"], linewidth=1, label="Close")
ax.plot(fx["Date"], fx["Close"].rolling(200).mean(), linewidth=2, label="200-day average")
ax.set_title("Simulated EUR/USD")
ax.set_xlabel("Date")
ax.set_ylabel("Price")
ax.legend()
ax.grid(alpha=0.3)
fig.tight_layout()
plt.show()
```

Every chart needs a title, axis labels (with units) and a legend when there's more than one series.

## Bar charts: comparing categories

```python
import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_csv("data/matches.csv")
shares = df["FTR"].value_counts(normalize=True).reindex(["H", "D", "A"])

fig, ax = plt.subplots(figsize=(5, 3.5))
bars = ax.bar(["Home win", "Draw", "Away win"], shares.values, color=["#2563eb", "#9ca3af", "#f59e0b"])
ax.bar_label(bars, labels=[f"{v:.0%}" for v in shares.values])
ax.set_ylabel("Share of matches")
ax.set_title("Results, all seasons")
ax.set_ylim(0, 0.6)
fig.tight_layout()
plt.show()
```

Sorted horizontal bars work well for long category names:

```python
import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_csv("data/matches.csv")
goals = df.groupby("HomeTeam")["FTHG"].mean().sort_values()

fig, ax = plt.subplots(figsize=(6, 6))
ax.barh(goals.index, goals.values, color="#2563eb")
ax.set_xlabel("Average home goals per match")
ax.set_title("Home attack by team")
fig.tight_layout()
plt.show()
```

## Histograms: distributions

```python
import matplotlib.pyplot as plt
import pandas as pd

fx = pd.read_csv("data/eurusd_daily.csv", parse_dates=["Date"])
returns = fx["Close"].pct_change().dropna()

fig, ax = plt.subplots(figsize=(6, 3.5))
ax.hist(returns, bins=60, color="#2563eb", alpha=0.8)
ax.axvline(0, color="black", linewidth=1)
ax.set_title("Distribution of daily returns")
ax.set_xlabel("Daily return")
ax.set_ylabel("Number of days")
fig.tight_layout()
plt.show()
```

## Scatter plots: relationships

```python
import matplotlib.pyplot as plt
import pandas as pd

houses = pd.read_csv("data/houses.csv")

fig, ax = plt.subplots(figsize=(6, 4))
points = ax.scatter(houses["size_sqm"], houses["price"] / 1000, c=houses["distance_km"], cmap="viridis", s=12, alpha=0.7)
fig.colorbar(points, ax=ax, label="Distance to centre (km)")
ax.set_xlabel("Size (m²)")
ax.set_ylabel("Price (£ thousands)")
ax.set_title("Bigger and more central homes cost more")
fig.tight_layout()
plt.show()
```

Colour adds a third variable. Scatter plots are how you'll eyeball relationships before modelling them in Phase 5.

## Several charts in one figure

```python
import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_csv("data/matches.csv")
fig, axes = plt.subplots(1, 3, figsize=(11, 3.2), sharey=True)

for ax, (col, label) in zip(axes, [("FTHG", "Home goals"), ("FTAG", "Away goals"), ("HST", "Home shots on target")]):
    counts = df[col].value_counts().sort_index()
    ax.bar(counts.index, counts.values, color="#2563eb")
    ax.set_title(label)
    ax.set_xlabel("Count per match")
axes[0].set_ylabel("Number of matches")
fig.suptitle("Distributions per match")
fig.tight_layout()
plt.show()
```

## Quick plots with pandas

DataFrames and Series have a `.plot()` method that builds Matplotlib charts for you, great for quick exploration:

```python
import matplotlib.pyplot as plt
import pandas as pd

sales = pd.read_csv("data/sales.csv", parse_dates=["Date"])
sales["Revenue"] = sales["Units"] * sales["UnitPrice"]
monthly = sales.pivot_table(index=pd.Grouper(key="Date", freq="ME"), columns="Category", values="Revenue", aggfunc="sum")

ax = monthly.plot(figsize=(8, 3.5), title="Monthly revenue by category", marker="o")
ax.set_ylabel("Revenue (£)")
plt.tight_layout()
plt.show()
```

## Charts that tell the truth

- **Start bar charts at zero.** Bar length encodes the value; a truncated axis exaggerates differences. Line charts can zoom in.
- **Pick the chart for the question:** comparing categories → bar; change over time → line; distribution → histogram; relationship → scatter.
- **Label everything** and put units on axes.
- **Avoid 3D, pie charts with many slices and rainbow colours.** They make values harder to compare.
- **Show uncertainty** when you can. A model's ROI of +3% over 50 bets means little; in Phase 4 you'll add confidence intervals.

:::tip Other libraries
**seaborn** makes statistical charts with less code, and **Plotly** makes interactive charts. Both are worth learning later, and both are built on the same ideas. In this browser runner you can add seaborn with `import micropip; await micropip.install("seaborn")`.
:::

## Practice

These exercises return a Matplotlib figure. The tests inspect it: titles, labels, and the number of lines or bars.

:::exercise viz-line Line chart of a rolling average
Complete `price_chart(fx)`. Create a figure with one axes and plot two lines against the `Date` column: `Close`, and its 50-day rolling mean. Set the title to `"Close and 50-day average"`, the y-axis label to `"Price"`, add a legend, and return the figure.

@@starter
import matplotlib.pyplot as plt

def price_chart(fx):
    fig, ax = plt.subplots()
    return fig

@@solution
import matplotlib.pyplot as plt

def price_chart(fx):
    fig, ax = plt.subplots(figsize=(8, 3.5))
    ax.plot(fx["Date"], fx["Close"], label="Close")
    ax.plot(fx["Date"], fx["Close"].rolling(50).mean(), label="50-day average")
    ax.set_title("Close and 50-day average")
    ax.set_ylabel("Price")
    ax.legend()
    return fig

@@tests
import pandas as pd

def chart():
    return price_chart(pd.read_csv("data/eurusd_daily.csv", parse_dates=["Date"]))

def test_two_lines():
    """Plots two lines"""
    ax = chart().axes[0]
    assert len(ax.get_lines()) == 2, f"found {len(ax.get_lines())} lines"

def test_labels():
    """Title, y label and legend"""
    ax = chart().axes[0]
    assert ax.get_title() == "Close and 50-day average"
    assert ax.get_ylabel() == "Price"
    assert ax.get_legend() is not None, "add a legend with ax.legend()"
:::

:::exercise viz-bar Bar chart of team points
Complete `points_chart(table)`. `table` is a DataFrame indexed by team with a `Pts` column. Draw a **horizontal** bar chart (`ax.barh`) of points, sorted so the team with the most points is at the **top**. Set the x label to `"Points"` and the title to `"League table"`. Return the figure.

@@starter
import matplotlib.pyplot as plt

def points_chart(table):
    fig, ax = plt.subplots()
    return fig

@@solution
import matplotlib.pyplot as plt

def points_chart(table):
    ordered = table["Pts"].sort_values()
    fig, ax = plt.subplots(figsize=(6, 6))
    ax.barh(ordered.index, ordered.values)
    ax.set_xlabel("Points")
    ax.set_title("League table")
    return fig

@@tests
import pandas as pd

TABLE = pd.DataFrame({"Pts": [71, 85, 60, 78]}, index=["Bramley", "Ashford", "Dunmore", "Castleton"])

def test_bars():
    """One horizontal bar per team"""
    ax = points_chart(TABLE).axes[0]
    widths = [p.get_width() for p in ax.patches]
    assert len(widths) == 4, f"found {len(widths)} bars"

def test_order():
    """Most points at the top"""
    ax = points_chart(TABLE).axes[0]
    bars = sorted(ax.patches, key=lambda p: p.get_y())
    assert [p.get_width() for p in bars][-1] == 85, "the top bar should be the highest points"
    assert [p.get_width() for p in bars] == sorted(p.get_width() for p in bars)

def test_labels():
    """Has the title and x label"""
    ax = points_chart(TABLE).axes[0]
    assert ax.get_title() == "League table" and ax.get_xlabel() == "Points"

@@hint
`barh` draws the first item at the bottom. Sort ascending with `sort_values()` so the largest ends up at the top.
:::

:::exercise viz-subplots A two-panel figure
Complete `goals_panels(df)`: create a figure with **two** axes side by side (`plt.subplots(1, 2)`). In the left axes draw a histogram of home goals (`FTHG`), in the right a histogram of away goals (`FTAG`). Title them `"Home goals"` and `"Away goals"`. Return the figure.

@@starter
import matplotlib.pyplot as plt

def goals_panels(df):
    fig, ax = plt.subplots()
    return fig

@@solution
import matplotlib.pyplot as plt

def goals_panels(df):
    fig, (left, right) = plt.subplots(1, 2, figsize=(9, 3.2), sharey=True)
    left.hist(df["FTHG"], bins=range(0, 9))
    left.set_title("Home goals")
    right.hist(df["FTAG"], bins=range(0, 9))
    right.set_title("Away goals")
    return fig

@@tests
import pandas as pd

def test_two_axes():
    """Two axes with the right titles"""
    fig = goals_panels(pd.read_csv("data/matches.csv"))
    titles = [ax.get_title() for ax in fig.axes]
    assert titles == ["Home goals", "Away goals"], titles

def test_histograms():
    """Each axes has bars"""
    fig = goals_panels(pd.read_csv("data/matches.csv"))
    assert all(len(ax.patches) > 0 for ax in fig.axes)
:::

:::quiz viz-quiz Quick check
? Which chart best shows how a price changed over time?
- [x] Line chart
- [ ] Pie chart
- [ ] Histogram
> Lines show change over a continuous axis.

? Why should bar charts start at zero?
- [x] Bar length represents the value; a cut-off axis exaggerates differences
- [ ] Matplotlib requires it
> Line charts can zoom in; bars shouldn't.

? What does `fig, axes = plt.subplots(2, 3)` create?
- [x] A figure with a 2×3 grid of axes
- [ ] Two figures with three charts each
- [ ] Six separate figures
> `axes` is a 2D array of Axes objects.

? Which chart shows the relationship between house size and price?
- [x] Scatter plot
- [ ] Bar chart
- [ ] Line chart
> Each point is one house.
:::
