"""Grading harness for the in-browser Python runner.

Loaded by public/pyodide-worker.js inside Pyodide, and imported by
scripts/validate_content.py in regular CPython, so exercises are graded
the same way in both places. Entry point: await _pp_run(code, tests=None),
which returns a JSON string.
"""
import ast, base64, builtins, contextlib, inspect, io, json, linecache, os, sys, time, traceback, warnings

os.environ.setdefault("MPLBACKEND", "AGG")
warnings.filterwarnings("ignore", message=".*non-interactive.*")

_PP_USER_FILES = ("main.py", "tests.py")
_PP_HINTS = {
    "NameError": "Hint: check the spelling, and make sure the name is defined before this line runs.",
    "IndentationError": "Hint: Python uses indentation to group code. Use 4 spaces per level and keep blocks lined up.",
    "TypeError": "Hint: a value has the wrong type for this operation. print(type(x)) helps you check.",
    "ZeroDivisionError": "Hint: something was divided by zero. Check the value of the divisor.",
    "ModuleNotFoundError": "Hint: this package isn't preinstalled. Try: import micropip; await micropip.install('package-name')",
}


def _pp_input(prompt=""):
    raise RuntimeError(
        "input() can't read from your keyboard in the browser runner. "
        "Replace it with a value instead, for example: name = \"Ada\""
    )


def _pp_format_exception(exc):
    te = traceback.TracebackException.from_exception(exc)
    frames = [f for f in te.stack if f.filename in _PP_USER_FILES]
    lines = []
    if frames and not isinstance(exc, SyntaxError):
        lines.append("Traceback (most recent call last):\n")
        lines.extend(traceback.StackSummary.from_list(frames).format())
    lines.extend(te.format_exception_only())
    text = "".join(lines).rstrip()
    hint = _PP_HINTS.get(type(exc).__name__)
    if isinstance(exc, RuntimeError) and "thread" in str(exc):
        hint = (
            "Hint: the browser runner has no threads. With FastAPI, write every endpoint and dependency "
            "as `async def` (not `def`), and call the app through httpx.ASGITransport."
        )
    return text + ("\n\n" + hint if hint else "")


class _PPTee(io.TextIOBase):
    def __init__(self, target):
        self.target = target
        self.parts = []

    def writable(self):
        return True

    def write(self, s):
        self.parts.append(s)
        self.target.write(s)
        return len(s)

    def flush(self):
        self.target.flush()

    def getvalue(self):
        return "".join(self.parts)


def _pp_close_figures():
    if "matplotlib.pyplot" in sys.modules:
        sys.modules["matplotlib.pyplot"].close("all")


def _pp_collect_figures():
    if "matplotlib.pyplot" not in sys.modules:
        return []
    plt = sys.modules["matplotlib.pyplot"]
    images = []
    for num in plt.get_fignums():
        buf = io.BytesIO()
        plt.figure(num).savefig(buf, format="png", dpi=110, bbox_inches="tight")
        images.append(base64.b64encode(buf.getvalue()).decode())
    plt.close("all")
    return images


async def _pp_exec(src, filename, ns):
    linecache.cache[filename] = (len(src), None, src.splitlines(True), filename)
    code = compile(src, filename, "exec", flags=ast.PyCF_ALLOW_TOP_LEVEL_AWAIT, dont_inherit=True)
    result = eval(code, ns)
    if inspect.iscoroutine(result):
        await result


def _pp_failing_line(exc):
    frames = [f for f in traceback.extract_tb(exc.__traceback__) if f.filename == "tests.py"]
    if frames and frames[-1].line:
        return "Check failed: " + frames[-1].line.strip()
    return "Check failed"


async def _pp_run_tests(tests_src, user_ns, stdout_text, user_src):
    ns = dict(user_ns)
    ns["output"] = stdout_text
    ns["source"] = user_src
    before = dict(ns)
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            await _pp_exec(tests_src, "tests.py", ns)
    except BaseException as exc:
        return [{"name": "load_tests", "description": "Load the tests", "passed": False,
                 "error": _pp_format_exception(exc)}]
    results = []
    for name, fn in list(ns.items()):
        if not name.startswith("test_") or not callable(fn):
            continue
        if name in before and before[name] is fn:
            continue
        doc = inspect.getdoc(fn) or name[5:].replace("_", " ").capitalize()
        entry = {"name": name, "description": doc.splitlines()[0], "passed": True, "error": None}
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                value = fn()
                if inspect.isawaitable(value):
                    await value
        except AssertionError as exc:
            entry["passed"] = False
            entry["error"] = str(exc).strip() or _pp_failing_line(exc)
        except BaseException as exc:
            entry["passed"] = False
            entry["error"] = _pp_format_exception(exc)
        finally:
            _pp_close_figures()
        results.append(entry)
    if not results:
        results.append({"name": "no_tests", "description": "Find tests", "passed": False,
                        "error": "No test_ functions were found."})
    return results


async def _pp_run(code, tests=None):
    started = time.perf_counter()
    ns = {"__name__": "__main__", "__builtins__": builtins, "input": _pp_input}
    tee = _PPTee(sys.stdout)
    result = {"ok": True, "error": None, "figures": [], "tests": None}
    _pp_close_figures()
    try:
        with contextlib.redirect_stdout(tee):
            await _pp_exec(code, "main.py", ns)
    except SystemExit as exc:
        if exc.code not in (None, 0):
            result["ok"] = False
            result["error"] = "SystemExit: " + str(exc.code)
    except BaseException as exc:
        result["ok"] = False
        result["error"] = _pp_format_exception(exc)
    finally:
        sys.stdout.flush()
        sys.stderr.flush()
    try:
        result["figures"] = _pp_collect_figures()
    except Exception as exc:
        result["error"] = (result["error"] or "") + "\nCould not draw the figure: " + repr(exc)
    if tests is not None and result["ok"]:
        result["tests"] = await _pp_run_tests(tests, ns, tee.getvalue(), code)
    sys.stdout.flush()
    result["duration"] = round((time.perf_counter() - started) * 1000)
    return json.dumps(result)
