---
title: Cleaning messy data
summary: Missing values, inconsistent text, numbers stored as text, mixed date formats, impossible values and duplicates, and a repeatable cleaning function.
minutes: 60
kind: lesson
---

Data scientists joke that 80% of the job is cleaning data. It's not really a joke. Models trained on dirty data learn the dirt. This lesson uses `data/customers_messy.csv`, a deliberately awful file of the kind you'll meet in real life.

```python
import pandas as pd

raw = pd.read_csv("data/customers_messy.csv")
print(raw.head(10).to_string())
raw.info()
```

Problems already visible: names with odd spacing and capitals, cities spelled several ways, dates in different formats, spends with and without a `£`, and missing values. Let's fix them one at a time.

## Missing values

pandas represents missing data as `NaN` (or `NA`/`NaT` for some types). Find it first:

```python
import pandas as pd

raw = pd.read_csv("data/customers_messy.csv")
print(raw.isna().sum())               # missing values per column
print(raw.isna().mean().round(3))     # as a fraction
print(raw[raw["city"].isna()].head(3))
```

`read_csv` already turned empty cells and common markers like `"N/A"` into `NaN`. Your options for each column:

```python
import pandas as pd

raw = pd.read_csv("data/customers_messy.csv")
print(raw.dropna().shape)                        # drop rows with ANY missing value: often too aggressive
print(raw.dropna(subset=["city"]).shape)         # drop rows missing a specific column
print(raw["city"].fillna("Unknown").value_counts().tail(3))       # fill with a placeholder
print(raw["age"].fillna(raw["age"].median()).isna().sum())        # fill with a typical value
```

There's no universal answer. Ask *why* it's missing. A missing city might just mean "not collected"; a missing price might mean the item was free. Filling missing values with the mean can hide real patterns, and in time series, filling from the future leaks information. Always record what you did.

## Inconsistent text

```python
import pandas as pd

raw = pd.read_csv("data/customers_messy.csv")
print(raw["city"].value_counts(dropna=False))
```

Twelve spellings of four cities. Strip spaces, standardise the case, then fix known typos with `replace`:

```python
import pandas as pd

raw = pd.read_csv("data/customers_messy.csv")
city = raw["city"].str.strip().str.title().replace({"Manchster": "Manchester"})
print(city.value_counts(dropna=False))

plan = raw["plan"].str.strip().str.lower()
print(plan.value_counts())

name = raw["name"].str.strip().str.title()
print(name.head().tolist())
```

## Numbers stored as text

`monthly_spend` contains values like `"£9.99"`, so pandas read it as text. Remove the symbol, then convert with `pd.to_numeric`. `errors="coerce"` turns anything unconvertible into `NaN` instead of crashing:

```python
import pandas as pd

raw = pd.read_csv("data/customers_messy.csv")
print(raw["monthly_spend"].head(8).tolist())
spend = pd.to_numeric(raw["monthly_spend"].str.replace("£", "", regex=False), errors="coerce")
print(spend.head(8).tolist())
print(spend.dtype, spend.isna().sum(), "missing")
```

## Regular expressions

For more complex text patterns, `str` methods accept **regular expressions** (regex), a mini-language for matching text. A few building blocks go a long way:

| Pattern | Matches |
| --- | --- |
| `\d` | a digit |
| `\s` | whitespace |
| `[A-Z]` | one capital letter |
| `+` | one or more of the previous thing |
| `?` | optional |
| `(...)` | a group to extract |

```python
import pandas as pd

s = pd.Series(["Order #1234 (£12.50)", "order #77 (£3)", "no order"])
print(s.str.extract(r"#(\d+)"))                       # pull out the order number
print(s.str.extract(r"£(\d+(?:\.\d+)?)").astype(float))   # pull out the amount
print(s.str.contains(r"#\d+", regex=True))
print(s.str.replace(r"\s+", " ", regex=True))         # collapse repeated spaces
```

Regex is powerful but hard to read. Use plain string methods when they're enough.

## Dates in several formats

The `signup_date` column mixes `2023-01-05`, `05/01/2023` and `Jan 05 2023`, plus the word `unknown`. The tempting shortcut is dangerous:

```python
import pandas as pd

dates = pd.Series(["2022-04-03", "18/04/2024", "Mar 06 2023"])
print(pd.to_datetime(dates, format="mixed", dayfirst=True))
```

Look closely: `dayfirst=True` made pandas read the ISO date `2022-04-03` as **4 March**, not 3 April. It didn't warn you; the data is just silently wrong. The robust approach is to parse each known format explicitly and combine the results:

```python
import pandas as pd

raw = pd.read_csv("data/customers_messy.csv")
d = raw["signup_date"]
iso = pd.to_datetime(d, format="%Y-%m-%d", errors="coerce")
uk = pd.to_datetime(d, format="%d/%m/%Y", errors="coerce")
text = pd.to_datetime(d, format="%b %d %Y", errors="coerce")
signup = iso.fillna(uk).fillna(text)

print(signup.head(6).tolist())
print("unparsed:", d[signup.isna()].unique())
```

Each `to_datetime` call only accepts its own format (`errors="coerce"` gives `NaT` for the rest), and `fillna` fills the gaps in order. The format codes: `%Y` four-digit year, `%m` month number, `%d` day, `%b` abbreviated month name.

:::warning UK vs US dates
`05/01/2023` is 5 January in the UK and May 1st in the US. Never guess. Find out which convention the source uses. Football-Data.co.uk files, for example, use day-first dates.
:::

## Impossible values

```python
import pandas as pd

raw = pd.read_csv("data/customers_messy.csv")
print(raw["age"].describe())
print(raw.loc[~raw["age"].between(16, 110) & raw["age"].notna(), ["customer_id", "age"]])
age = raw["age"].where(raw["age"].between(16, 110))    # keep plausible values, others become NaN
print(age.isna().sum(), "ages now missing")
```

`where(condition)` keeps values where the condition is true and replaces the rest with `NaN`. Turning impossible values into missing values is usually better than deleting the whole row.

## Duplicates

```python
import pandas as pd

raw = pd.read_csv("data/customers_messy.csv")
print(raw.duplicated().sum(), "fully duplicated rows")
print(raw["customer_id"].duplicated().sum(), "repeated customer IDs")
deduped = raw.drop_duplicates()
print(raw.shape, "->", deduped.shape)
```

## Put it in a function

Clean data with a **function**, not a series of notebook cells. Then the same steps run every time new data arrives, and you can test them:

```python
import pandas as pd

def parse_dates(s: pd.Series) -> pd.Series:
    formats = ["%Y-%m-%d", "%d/%m/%Y", "%b %d %Y"]
    result = pd.to_datetime(s, format=formats[0], errors="coerce")
    for fmt in formats[1:]:
        result = result.fillna(pd.to_datetime(s, format=fmt, errors="coerce"))
    return result

def clean_customers(raw: pd.DataFrame) -> pd.DataFrame:
    return (
        raw.drop_duplicates()
        .assign(
            name=lambda d: d["name"].str.strip().str.title(),
            city=lambda d: d["city"].str.strip().str.title().replace({"Manchster": "Manchester"}),
            plan=lambda d: d["plan"].str.strip().str.lower(),
            signup_date=lambda d: parse_dates(d["signup_date"]),
            age=lambda d: d["age"].where(d["age"].between(16, 110)),
            monthly_spend=lambda d: pd.to_numeric(d["monthly_spend"].str.replace("£", "", regex=False), errors="coerce"),
        )
        .sort_values("customer_id")
        .reset_index(drop=True)
    )

clean = clean_customers(pd.read_csv("data/customers_messy.csv"))
print(clean.head().to_string())
clean.info()
print(clean.groupby("plan")["monthly_spend"].mean().round(2))
```

`assign(column=lambda d: ...)` calculates each new column from the DataFrame as it is at that point in the chain, which keeps the whole pipeline in one readable expression.

## Practice

:::exercise clean-spend Parse prices
Complete `parse_prices(s)`. It receives a Series of price strings like `"£1,250.00"`, `"12.5"`, `" £3 "` or `"free"`. Return a float Series where:

- `£` signs, commas and surrounding spaces are removed,
- `"free"` (any capitalisation) becomes `0.0`,
- anything else that can't be converted becomes `NaN`.

@@starter
import pandas as pd

def parse_prices(s):
    return pd.to_numeric(s)

@@solution
import pandas as pd

def parse_prices(s):
    cleaned = s.str.strip().str.replace("£", "", regex=False).str.replace(",", "", regex=False)
    cleaned = cleaned.mask(cleaned.str.lower() == "free", "0")
    return pd.to_numeric(cleaned, errors="coerce")

@@tests
import pandas as pd
import numpy as np

def test_values():
    """Parses a mix of formats"""
    got = parse_prices(pd.Series(["£1,250.00", "12.5", " £3 ", "FREE", "call us", "free"]))
    assert np.allclose(got[[0, 1, 2, 3, 5]], [1250.0, 12.5, 3.0, 0.0, 0.0])
    assert np.isnan(got[4])

def test_dtype():
    """Returns numbers, not strings"""
    assert parse_prices(pd.Series(["1.5", "£2"])).dtype.kind in "fi"

@@hint
Chain `.str.strip()`, `.str.replace("£", "", regex=False)` and `.str.replace(",", "", regex=False)`. Replace "free" with "0" (e.g. using `.mask(condition, "0")` or `.where`), then `pd.to_numeric(..., errors="coerce")`.
:::

:::exercise clean-dates Parse UK and ISO dates safely
Complete `parse_dates(s)` so it correctly parses a Series containing ISO dates (`"2024-04-03"`), UK dates (`"03/04/2024"`, day first) and dates like `"Apr 03 2024"`. Anything else becomes `NaT`.

All three examples above are 3 April 2024. Don't use `format="mixed"` with `dayfirst=True`: as you saw, it misreads ISO dates.

@@starter
import pandas as pd

def parse_dates(s):
    return pd.to_datetime(s, format="mixed", dayfirst=True, errors="coerce")

@@solution
import pandas as pd

def parse_dates(s):
    result = pd.to_datetime(s, format="%Y-%m-%d", errors="coerce")
    for fmt in ["%d/%m/%Y", "%b %d %Y"]:
        result = result.fillna(pd.to_datetime(s, format=fmt, errors="coerce"))
    return result

@@tests
import pandas as pd

def test_three_formats():
    """All three formats give 3 April 2024"""
    got = parse_dates(pd.Series(["2024-04-03", "03/04/2024", "Apr 03 2024"]))
    assert (got == pd.Timestamp("2024-04-03")).all(), got.tolist()

def test_unknown():
    """Unparseable values become NaT"""
    got = parse_dates(pd.Series(["unknown", "2024-13-45"]))
    assert got.isna().all()

def test_real_file():
    """Parses all but the 'unknown' values in the customers file"""
    raw = pd.read_csv("data/customers_messy.csv")
    got = parse_dates(raw["signup_date"])
    assert got.isna().sum() == (raw["signup_date"] == "unknown").sum()
:::

:::exercise clean-pipeline A cleaning function
Complete `clean(raw)` for the customers data. It must:

1. drop exact duplicate rows,
2. strip and title-case `name` and `city`, and fix the typo `"Manchster"` → `"Manchester"`,
3. lowercase and strip `plan`,
4. convert `monthly_spend` to float (remove `£`; unparseable becomes `NaN`),
5. set ages outside 16–110 to `NaN`,
6. return the result sorted by `customer_id` with a fresh 0, 1, 2... index.

@@starter
import pandas as pd

def clean(raw):
    df = raw.copy()
    return df

@@solution
import pandas as pd

def clean(raw):
    df = raw.drop_duplicates().copy()
    df["name"] = df["name"].str.strip().str.title()
    df["city"] = df["city"].str.strip().str.title().replace({"Manchster": "Manchester"})
    df["plan"] = df["plan"].str.strip().str.lower()
    df["monthly_spend"] = pd.to_numeric(df["monthly_spend"].str.replace("£", "", regex=False), errors="coerce")
    df["age"] = df["age"].where(df["age"].between(16, 110))
    return df.sort_values("customer_id").reset_index(drop=True)

@@tests
import pandas as pd

def cleaned():
    return clean(pd.read_csv("data/customers_messy.csv"))

def test_no_duplicates():
    """Duplicates removed, one row per customer"""
    c = cleaned()
    assert len(c) == 120 and c["customer_id"].is_unique

def test_text():
    """Cities, plans and names are consistent"""
    c = cleaned()
    assert set(c["city"].dropna()) == {"London", "Manchester", "Leeds", "Bristol"}, set(c["city"].dropna())
    assert set(c["plan"]) == {"basic", "premium", "pro"}
    assert (c["name"] == c["name"].str.strip().str.title()).all()

def test_numbers():
    """Spend is numeric and ages are plausible"""
    c = cleaned()
    assert c["monthly_spend"].dtype.kind == "f"
    assert c["age"].dropna().between(16, 110).all()

def test_sorted_index():
    """Sorted by customer_id with a fresh index"""
    c = cleaned()
    assert c["customer_id"].is_monotonic_increasing and list(c.index) == list(range(len(c)))
:::

:::quiz cleaning-quiz Quick check
? What does `pd.to_numeric(s, errors="coerce")` do with "N/A"?
- [ ] Raises an error
- [x] Turns it into NaN
- [ ] Turns it into 0
> Coercing is the safe way to convert messy columns; then decide what to do with the NaNs.

? Why is `format="mixed", dayfirst=True` risky?
- [x] It can silently misread ISO dates like 2022-04-03 as 4 March
- [ ] It's slow
- [ ] It doesn't support UK dates
> Silent errors are the worst kind. Parse known formats explicitly.

? Why put cleaning steps in a function?
- [x] So exactly the same steps run on new data, and they can be tested
- [ ] Functions make pandas faster
> Notebooks cells run out of order are a classic source of irreproducible results.

? What does `s.where(s.between(16, 110))` do?
- [x] Keeps values in range and replaces the others with NaN
- [ ] Deletes rows outside the range
- [ ] Clips values to the range
> To clip instead, use `s.clip(16, 110)`.
:::
