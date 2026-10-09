---
title: Welcome and your first program
summary: How this course works, what Python is, and the first lines of code you'll ever run.
minutes: 30
kind: lesson
---

Welcome! By the end of this course you'll be able to write professional Python, analyse data, build and evaluate machine learning models, and serve them through a web API. That's a big goal, so it's broken into nine phases of small, practical lessons.

## How each lesson works

1. **Read** a short explanation. Every idea comes with code.
2. **Run** the code. Every grey box marked *python · editable* is real Python running in your browser. Press **Run**, or click in the box and press **Ctrl + Enter** (**⌘ + Enter** on a Mac). Change the code and run it again: you can't break anything.
3. **Practise** with exercises. Each one has automatic tests that check your code. Hints are there if you get stuck, and the solution is there if you're really stuck.
4. **Check** your understanding with a quick quiz.
5. **Mark the lesson complete** at the bottom of the page. Your progress is saved.

Each phase ends with a **project** that builds something real, and a **checkpoint test**.

:::tip How to learn fastest
Type the code yourself instead of copying it: your fingers learn the syntax faster than your eyes. And when you get an error, read it before you change anything. Errors are messages from Python telling you exactly what went wrong.
:::

## What is Python?

A program is a list of instructions for a computer. Python is a language for writing those instructions, designed to be readable. It is the most popular language in the world for data science and machine learning, and widely used for web backends, automation and scripting.

Here's a complete Python program. Press **Run**:

```python
print("Hello, world!")
```

`print` is a **function**: a named piece of code that does a job. You call it by writing its name followed by parentheses. Whatever you put inside the parentheses is the function's **argument**. `print` displays its argument as output.

The text in quotes is a **string**: a piece of text. Strings can use double quotes `"like this"` or single quotes `'like this'`.

## Printing several things

You can call `print` as many times as you like. Each call starts a new line. You can also give `print` several arguments separated by commas, and it puts a space between them:

```python
print("My goal:")
print("Learn Python", "then", "machine learning")
print()  # an empty print() prints a blank line
print("Lines run from top to bottom.")
```

The text after `#` is a **comment**. Python ignores comments; they're notes for humans. Good comments explain *why* code does something.

## Python as a calculator

Python understands numbers and arithmetic. Numbers don't need quotes:

```python
print(2 + 3)
print(10 - 4)
print(6 * 7)      # multiplication uses *
print(7 / 2)      # division uses /
print(2 ** 10)    # ** means "to the power of"
print((2 + 3) * 4)
```

Notice the difference between `"2 + 3"` (a string, printed as-is) and `2 + 3` (an expression Python calculates):

```python
print("2 + 3")
print(2 + 3)
```

## Errors are normal

Every programmer sees errors constantly. What matters is reading them. Run this cell, which has a typo on purpose:

```python expect-error
print("This line works")
prnt("This line has a typo")
```

The error message tells you:

- **where**: `line 2`, with the exact code underlined,
- **what kind** of error: `NameError`,
- **what happened**: `name 'prnt' is not defined`. Python doesn't know any function called `prnt`.

Notice that line 1 ran before the error. Python runs code top to bottom and stops at the first error.

Here's another common one, a **syntax error**. The code isn't valid Python, so nothing runs at all:

```python expect-error
print("Where does this string end?)
```

:::note Where does the code run?
For the first phase, everything runs right here in your browser using [Pyodide](https://pyodide.org/), a full version of Python compiled to run in web pages. In Phase 2 you'll install Python on your own computer and use VS Code, and in Phase 7 you'll use Google Colab for its free GPUs. The Python is the same everywhere.
:::

## Your turn

:::exercise hello-pypath Say hello
Write a program that prints exactly this line:

```text
Hello, PyPath!
```

Then press **Check my code** to run the tests.

@@starter
# Write your code below this line

@@solution
print("Hello, PyPath!")

@@tests
def test_prints_greeting():
    """Prints exactly: Hello, PyPath!"""
    printed = output.strip()
    assert printed != "", "Nothing was printed. Did you call print()?"
    assert printed == "Hello, PyPath!", f"Expected 'Hello, PyPath!' but your code printed {printed!r}"

@@hint
Use the `print` function with the text inside quotes.

@@hint
Check the capital letters, the comma and the exclamation mark: tests compare text exactly.
:::

:::exercise three-lines Introduce yourself
Print **three lines**:

1. `Name: ` followed by your name (any name works)
2. `Goal: Machine learning`
3. The result of the calculation `52 * 7`, calculated by Python (not typed in by you)

For example:

```text
Name: Ada
Goal: Machine learning
364
```

@@starter
# Line 1: your name
# Line 2: your goal
# Line 3: let Python calculate 52 * 7

@@solution
print("Name: Ada")
print("Goal: Machine learning")
print(52 * 7)

@@tests
def test_three_lines():
    """Prints exactly three lines"""
    lines = output.strip().splitlines()
    assert len(lines) == 3, f"Expected 3 lines, got {len(lines)}"

def test_name_line():
    """First line starts with 'Name: ' and includes a name"""
    first = output.strip().splitlines()[0]
    assert first.startswith("Name: "), f"First line should start with 'Name: ', got {first!r}"
    assert len(first) > len("Name: "), "Add your name after 'Name: '"

def test_goal_line():
    """Second line is 'Goal: Machine learning'"""
    assert output.strip().splitlines()[1] == "Goal: Machine learning"

def test_calculation():
    """Third line is the result of 52 * 7"""
    assert output.strip().splitlines()[2] == "364", "The third line should be the number 364"

@@hint
You need three separate `print(...)` calls.

@@hint
For the last line, don't put quotes around `52 * 7`, so Python calculates it.
:::

:::exercise fix-the-bugs Fix the bugs
This program has **two** bugs. Run it, read the error, fix it, and repeat until it prints:

```text
Python is fun
42
```

@@starter
print("Python is fun)
Print(40 + 2)

@@solution
print("Python is fun")
print(40 + 2)

@@tests
def test_output():
    """Prints 'Python is fun' then 42"""
    assert output.strip().splitlines() == ["Python is fun", "42"]

@@hint
The first error is a `SyntaxError`: a string is missing its closing quote.

@@hint
Python is **case sensitive**: `Print` and `print` are different names.
:::

:::quiz welcome-quiz Quick check
? What does `print(3 * 4)` display?
- [ ] 3 * 4
- [x] 12
- [ ] "12"
> Without quotes, Python calculates the expression and prints the result.

? What does `print("3 * 4")` display?
- [x] 3 * 4
- [ ] 12
- [ ] An error
> The quotes make it a string, so it's printed exactly as written.

? Python stops with an error on line 5 of a 10-line program. What happened to lines 1–4?
- [x] They ran normally
- [ ] Nothing ran at all
- [ ] Lines 1–4 and 6–10 ran
> Python runs top to bottom and stops at the first runtime error. (A **syntax** error is different: then nothing runs, because Python can't understand the program.)

? Which of these lines are comments?
- [x] `# calculate the total`
- [ ] `print("# not a comment")`
- [x] `   # indented comment`
> A comment starts with `#` outside a string. Inside quotes, `#` is just a character in the text.
:::

## What's next

Next lesson you'll store values in **variables** and learn the basic types of data Python works with.

**Optional extra:** watch the first lecture of [CS50P](https://cs50.harvard.edu/python/) or do the first exercise of [Kaggle Learn: Python](https://www.kaggle.com/learn/python) for a second take on today's ideas.
