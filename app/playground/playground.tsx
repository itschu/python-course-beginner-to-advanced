"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

import { RunButton } from "@/components/python/code-cell";
import Editor from "@/components/python/editor";
import { OutputPanel } from "@/components/python/output-panel";
import { RunnerStatus } from "@/components/python/runner-status";
import { useCodeRun } from "@/components/python/use-code-run";
import type { Dataset } from "@/lib/datasets";

const STORAGE_KEY = "pypath-playground";

export const EXAMPLES: { title: string; code: string }[] = [
  {
    title: "Hello, Python",
    code: `name = "Ada"
print(f"Hello, {name}!")

for i in range(1, 4):
    print(i, "squared is", i ** 2)
`,
  },
  {
    title: "Explore the football data (pandas)",
    code: `import pandas as pd

df = pd.read_csv("data/matches.csv", parse_dates=["Date"])
print(df.shape)
print(df.head())

# How often does the home team win?
print(df["FTR"].value_counts(normalize=True).round(3))
`,
  },
  {
    title: "Draw a chart (matplotlib)",
    code: `import pandas as pd
import matplotlib.pyplot as plt

prices = pd.read_csv("data/eurusd_daily.csv", parse_dates=["Date"], index_col="Date")
prices["Close"].plot(figsize=(8, 3), title="Simulated EUR/USD close")
prices["Close"].rolling(200).mean().plot(label="200-day average")
plt.legend()
plt.tight_layout()
plt.show()
`,
  },
  {
    title: "Train a model (scikit-learn)",
    code: `from sklearn.datasets import load_breast_cancer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

X, y = load_breast_cancer(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=0)

model = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000))
model.fit(X_train, y_train)
print(f"Test accuracy: {model.score(X_test, y_test):.3f}")
`,
  },
  {
    title: "A FastAPI app (in your browser)",
    code: `from fastapi import FastAPI
import httpx

app = FastAPI()

# In the browser, write endpoints with "async def": there are no threads to run plain "def" ones.
@app.get("/odds/{decimal_odds}")
async def implied(decimal_odds: float):
    return {"odds": decimal_odds, "implied_probability": round(1 / decimal_odds, 4)}

transport = httpx.ASGITransport(app=app)
async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
    response = await client.get("/odds/2.5")
    print(response.status_code, response.json())
`,
  },
];

export function Playground({ datasets }: { datasets: Dataset[] }) {
  const [code, setCode] = useState(EXAMPLES[0].code);
  const run = useCodeRun();

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setCode(saved);
    } catch {
      // ignore
    }
  }, []);

  const change = (value: string) => {
    setCode(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // ignore
    }
  };

  const execute = () => {
    if (!run.running) void run.execute(code);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="min-w-0">
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/80">
            <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
              Example
              <select
                className="input w-auto py-1 text-xs"
                defaultValue=""
                onChange={(e) => {
                  const ex = EXAMPLES[Number(e.target.value)];
                  if (ex) {
                    change(ex.code);
                    run.clear();
                  }
                  e.target.value = "";
                }}
              >
                <option value="" disabled>
                  Load an example…
                </option>
                {EXAMPLES.map((ex, i) => (
                  <option key={ex.title} value={i}>
                    {ex.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="ml-auto flex items-center gap-2">
              <RunnerStatus />
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => change("")}>
                <RotateCcw className="size-3.5" aria-hidden /> Clear
              </button>
              <RunButton running={run.running} onRun={execute} onStop={run.stop} />
            </div>
          </div>
          <Editor value={code} onChange={change} onRun={execute} minHeight="22rem" maxHeight="60vh" />
          <OutputPanel
            run={run}
            runnerStatus={run.runner.status}
            runnerMessage={run.runner.message}
            emptyHint="Press Run (or Ctrl/⌘ + Enter) to execute your code. Your code is saved in this browser."
          />
        </div>
      </div>
      <aside className="space-y-4">
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Datasets you can open</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Use <code className="font-mono">pd.read_csv(&quot;data/matches.csv&quot;)</code> or{" "}
            <code className="font-mono">open(&quot;data/...&quot;)</code>.
          </p>
          <ul className="mt-3 space-y-3">
            {datasets.map((d) => (
              <li key={d.file}>
                <div className="font-mono text-xs font-semibold text-blue-700 dark:text-blue-400">data/{d.file}</div>
                <div className="text-xs text-zinc-600 dark:text-zinc-400">{d.title}</div>
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-4 text-xs text-zinc-600 dark:text-zinc-400">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Preinstalled packages</h2>
          <p className="mt-1">
            numpy, pandas, matplotlib, scipy, scikit-learn, statsmodels, xgboost, lightgbm, pydantic, fastapi, httpx,
            sqlalchemy and the whole standard library (including sqlite3). Other pure-Python packages can be installed
            with <code className="font-mono">import micropip; await micropip.install(&quot;name&quot;)</code>.
          </p>
        </div>
      </aside>
    </div>
  );
}
