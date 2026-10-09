---
title: Working with text (strings)
summary: Index, slice, search, clean and format strings, the everyday tools for messy real-world text.
minutes: 50
kind: lesson
---

Real data is full of text: team names, dates, file paths, product reviews. Most of it is messy. This lesson gives you the tools to pull text apart and clean it up.

## Indexing: one character at a time

A string is a sequence of characters. Each has a position, its **index**, starting from **0**:

```python
team = "Ashford"
print(team[0])     # first character
print(team[1])
print(team[-1])    # negative indexes count from the end
print(len(team))   # number of characters
```

| Character | A | s | h | f | o | r | d |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Index | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
| Negative index | -7 | -6 | -5 | -4 | -3 | -2 | -1 |

Asking for an index that doesn't exist is an error:

```python expect-error
team = "Ashford"
print(team[7])
```

## Slicing: pieces of a string

`text[start:stop]` gives the characters from `start` up to **but not including** `stop`:

```python
date = "2024-08-17"
print(date[0:4])    # year
print(date[5:7])    # month
print(date[8:])     # leaving out stop means "to the end"
print(date[:4])     # leaving out start means "from the beginning"
print(date[-2:])    # last two characters
print(date[::-1])   # a step of -1 reverses the string
```

The "up to but not including" rule seems odd at first, but it has a nice property: `text[:n]` and `text[n:]` split a string into two parts with nothing lost or repeated, and `stop - start` is the length of the slice.

## Strings can't be changed

Strings are **immutable**: once created they can't be modified. Methods that "change" a string actually return a new one:

```python expect-error
name = "ada"
name[0] = "A"
```

```python
name = "ada"
name = name.capitalize()   # build a new string and point the name at it
print(name)
```

## String methods

A **method** is a function that belongs to a value. You call it with a dot: `value.method()`. Strings have lots of useful ones:

```python
raw = "   Ashford CITY  "

print(raw.strip())            # remove spaces at both ends
print(raw.lower())            # lowercase
print(raw.upper())            # UPPERCASE
print(raw.strip().title())    # Capitalise Each Word
print(raw.replace("CITY", "Town"))
```

Notice `raw.strip().title()`: methods can be **chained**, each one working on the result of the last.

Searching:

```python
review = "Great value, great quality, would buy again"

print("great" in review)               # True: is it anywhere in the text?
print("Great" in review.lower())       # False: lower() made it "great"
print(review.lower().count("great"))   # how many times
print(review.find("value"))            # index where it starts (-1 if missing)
print(review.startswith("Great"))
print(review.endswith("again"))
```

## Splitting and joining

`split` breaks a string into a **list** of parts; `join` does the reverse. You'll meet lists properly in lesson 7, but they're easy to use already:

```python
line = "Ashford City,2,1,Bramley Rovers"
parts = line.split(",")
print(parts)
print(parts[0])          # the home team
print(int(parts[1]))     # home goals, converted to a number

words = ["machine", "learning", "is", "fun"]
print(" ".join(words))
print("-".join(words))
```

`split()` with no argument splits on any whitespace and ignores extra spaces, which is very handy for messy input:

```python
print("  too    many   spaces ".split())
```

This is exactly how CSV files (comma-separated values) are read, one line at a time. Python's `csv` module handles the tricky cases for you, and you'll use it in lesson 12.

## Special characters

A backslash starts an **escape sequence**: `\n` is a new line, `\t` a tab, `\"` a quote inside a double-quoted string. Triple quotes make a string that spans lines:

```python
print("Line one\nLine two")
print("Name\tGoals")
print("She said \"hi\"")

report = """Match report
------------
A thrilling game."""
print(report)
```

## Lining up text with f-strings

You can set a width and alignment inside f-string braces: `<` left, `>` right, `^` centre. Great for tables:

```python
print(f"{'Team':<20}{'Pts':>5}")
print(f"{'Ashford City':<20}{78:>5}")
print(f"{'Bramley Rovers':<20}{71:>5}")
print(f"{'Fairhaven FC':<20}{9:>5}")
```

## Practice

:::exercise clean-name Clean a team name
Names typed by people are messy. Complete `clean_name(raw)` so it removes spaces at the start and end and capitalises each word.

`clean_name("  ashford CITY ")` should return `"Ashford City"`.

@@starter
def clean_name(raw):
    return raw

@@solution
def clean_name(raw):
    return raw.strip().title()

@@tests
def test_messy():
    """'  ashford CITY ' becomes 'Ashford City'"""
    assert clean_name("  ashford CITY ") == "Ashford City", f"got {clean_name('  ashford CITY ')!r}"

def test_already_clean():
    """A clean name stays the same"""
    assert clean_name("Fairhaven Fc") == "Fairhaven Fc"

def test_lowercase():
    """'glenwood wanderers' becomes 'Glenwood Wanderers'"""
    assert clean_name("glenwood wanderers") == "Glenwood Wanderers"

@@hint
Chain two methods: one removes the outer spaces and one capitalises each word.
:::

:::exercise parse-date Pull apart a date
Complete `parse_date(text)`. It receives a date like `"2024-08-17"` (year-month-day) and returns a string like `"17/08/2024"` (day/month/year, the format used in UK spreadsheets).

Use slicing, or `split`.

@@starter
def parse_date(text):
    year = ""
    month = ""
    day = ""
    return f"{day}/{month}/{year}"

@@solution
def parse_date(text):
    year = text[0:4]
    month = text[5:7]
    day = text[8:10]
    return f"{day}/{month}/{year}"

@@tests
def test_example():
    """'2024-08-17' becomes '17/08/2024'"""
    assert parse_date("2024-08-17") == "17/08/2024", f"got {parse_date('2024-08-17')!r}"

def test_new_year():
    """'2025-01-01' becomes '01/01/2025'"""
    assert parse_date("2025-01-01") == "01/01/2025"

def test_end_of_year():
    """'1999-12-31' becomes '31/12/1999'"""
    assert parse_date("1999-12-31") == "31/12/1999"

@@hint
The year is characters 0 to 3, so `text[0:4]`. Count the positions of the month and day the same way.

@@hint
Or: `year, month, day = text.split("-")` splits on the dashes and gives you three variables at once.
:::

:::exercise score-line Read a score line
Each match result arrives as a line like `"Ashford City,2,1,Bramley Rovers"` (home team, home goals, away goals, away team).

Complete `describe(line)` so it returns a sentence like:

```text
Ashford City 2-1 Bramley Rovers (3 goals)
```

The number of goals must be calculated, so convert the goals to integers.

@@starter
def describe(line):
    parts = line.split(",")
    return line

@@solution
def describe(line):
    parts = line.split(",")
    home, home_goals, away_goals, away = parts[0], int(parts[1]), int(parts[2]), parts[3]
    total = home_goals + away_goals
    return f"{home} {home_goals}-{away_goals} {away} ({total} goals)"

@@tests
def test_example():
    """Describes Ashford City 2-1 Bramley Rovers"""
    got = describe("Ashford City,2,1,Bramley Rovers")
    assert got == "Ashford City 2-1 Bramley Rovers (3 goals)", f"got {got!r}"

def test_goalless():
    """Handles a 0-0 draw"""
    got = describe("Oakvale Rovers,0,0,Portwell Town")
    assert got == "Oakvale Rovers 0-0 Portwell Town (0 goals)", f"got {got!r}"

def test_big_score():
    """Adds goals as numbers, not text"""
    got = describe("Kingsport United,5,3,Lakeside Rangers")
    assert got == "Kingsport United 5-3 Lakeside Rangers (8 goals)", f"got {got!r}"

@@hint
After `split(",")`, `parts[1]` and `parts[2]` are strings like `"2"`. Use `int()` before adding them.
:::

:::exercise initials Initials
Complete `initials(full_name)` so it returns the uppercase initials of each word followed by dots, for example `initials("grace brewster hopper")` returns `"G.B.H."`.

You'll need a loop for this one: here's the pattern to complete. (Loops get their own lesson soon.)

@@starter
def initials(full_name):
    result = ""
    for word in full_name.split():
        result = result + ""   # add the first letter of word, uppercased, and a dot
    return result

@@solution
def initials(full_name):
    result = ""
    for word in full_name.split():
        result = result + word[0].upper() + "."
    return result

@@tests
def test_three_names():
    """'grace brewster hopper' gives 'G.B.H.'"""
    assert initials("grace brewster hopper") == "G.B.H.", f"got {initials('grace brewster hopper')!r}"

def test_two_names():
    """'Alan Turing' gives 'A.T.'"""
    assert initials("Alan Turing") == "A.T."

def test_extra_spaces():
    """Extra spaces are ignored"""
    assert initials("  ada   lovelace ") == "A.L."

@@hint
`word[0]` is the first letter. Make it uppercase with `.upper()`.
:::

:::quiz strings-quiz Quick check
? What is `"python"[1:4]`?
- [ ] "pyt"
- [x] "yth"
- [ ] "ytho"
> Indexes 1, 2 and 3: the slice stops *before* index 4.

? What is `"python"[-1]`?
- [ ] "p"
- [x] "n"
- [ ] An error
> Negative indexes count from the end.

? What does `"a,b,,c".split(",")` return?
- [ ] `["a", "b", "c"]`
- [x] `["a", "b", "", "c"]`
- [ ] `"abc"`
> Two commas in a row produce an empty string between them.

? `name = "ada"` then `name.upper()`. What is `name` now?
- [x] "ada"
- [ ] "ADA"
> Strings are immutable. `upper()` returns a new string, which was thrown away. You'd need `name = name.upper()`.

? Which expression is True?
- [x] `"cat" in "concatenate"`
- [ ] `"Cat" in "concatenate"`
- [x] `"concatenate".startswith("con")`
> `in` is case sensitive.
:::
