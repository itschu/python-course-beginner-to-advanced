# Course content

Lessons are Markdown files in `content/<phase-slug>/NN-lesson-slug.md`. The number sets the order;
the slug is the URL. Phase titles, outcomes and resources live in `curriculum.ts`.

After editing, run `npm run validate` to execute every example and exercise.

## Frontmatter

```yaml
---
title: Variables and types
summary: One sentence shown under the title and in lesson lists.
minutes: 40
kind: lesson        # lesson | project | checkpoint
colab: notebooks/07-02-pytorch-tensors.ipynb   # optional "Open in Colab" button
---
```

## Blocks

Ordinary Markdown works, including tables, `$inline$` and `$$display$$` maths.

### Code cells

````markdown
```python
print("Every python block is an editable, runnable cell")
```

```python static
# Shown with highlighting but not runnable (e.g. code that needs a GPU or a terminal)
```

```python expect-error
print(undefined)   # runnable; the validator expects it to raise
```
````

Each cell runs in a fresh namespace, so examples must be self-contained. Files in
`public/data/` can be opened as `"data/<name>"`. `input()` is not available in the browser.
Write FastAPI endpoints as `async def` (the browser has no threads).

### Exercises

```markdown
:::exercise implied-probability Implied probability
Prompt in Markdown. Explain exactly what to write.

@@starter
def implied_probability(odds):
    pass

@@solution
def implied_probability(odds):
    return 1 / odds

@@tests
def test_even_money():
    """Odds of 2.0 mean a 50% chance"""
    assert implied_probability(2.0) == 0.5

@@hint
Probability is the reciprocal of decimal odds.

@@hint
`1 / odds`
:::
```

Tests are `test_*` functions (sync or async) that run after the learner's code, in the same
namespace. The docstring's first line is shown to the learner. `output` holds everything the
learner's code printed, and `source` holds the learner's code as a string. The validator checks that the solution passes and the starter fails.

### Quizzes

```markdown
:::quiz basics-check Quick check
? What does `len("hello")` return?
- [ ] 4
- [x] 5
- [ ] "5"
> `len` counts characters, and returns an int.

? Which of these are mutable? (several correct answers make it a "choose all" question)
- [x] list
- [ ] tuple
- [x] dict
> Lists and dicts can change after creation; tuples can't.
:::
```

### Callouts

```markdown
:::tip Optional title
Markdown content.
:::
```

Variants: `note`, `info`, `tip`, `warning`, `colab`.

Display maths must have the `$$` delimiters on their own lines:

```markdown
$$
\text{EV} = p \times (o - 1) - (1 - p)
$$
```
