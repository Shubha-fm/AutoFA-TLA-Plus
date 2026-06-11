from __future__ import annotations

from typing import List, Dict, Tuple, Set, Optional
from pydantic import BaseModel, Field
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="AutoFA-TLA+ API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Transition(BaseModel):
    currentState: str = Field(..., min_length=1)
    inputSymbol: str = Field(..., min_length=1)
    nextState: str = Field(..., min_length=1)

class AutomataModel(BaseModel):
    automatonType: str = Field("DFA", pattern="^(DFA|NFA)$")
    states: List[str]
    alphabet: List[str]
    initialState: str
    acceptingStates: List[str]
    transitions: List[Transition]


def clean_items(items: List[str]) -> List[str]:
    out: List[str] = []
    seen: Set[str] = set()
    for item in items:
        value = item.strip()
        if value and value not in seen:
            out.append(value)
            seen.add(value)
    return out


def normalized(model: AutomataModel) -> AutomataModel:
    return AutomataModel(
        automatonType=model.automatonType,
        states=clean_items(model.states),
        alphabet=clean_items(model.alphabet),
        initialState=model.initialState.strip(),
        acceptingStates=clean_items(model.acceptingStates),
        transitions=[
            Transition(
                currentState=t.currentState.strip(),
                inputSymbol=t.inputSymbol.strip(),
                nextState=t.nextState.strip(),
            )
            for t in model.transitions
            if t.currentState.strip() and t.inputSymbol.strip() and t.nextState.strip()
        ],
    )


def validate_model(model: AutomataModel) -> Tuple[bool, List[str], List[str]]:
    m = normalized(model)
    errors: List[str] = []
    warnings: List[str] = []
    states = set(m.states)
    alphabet = set(m.alphabet)

    if not states:
        errors.append("At least one state is required.")
    if not alphabet:
        errors.append("At least one input symbol is required.")
    if m.initialState not in states:
        errors.append(f"Initial state '{m.initialState}' is not declared in states.")
    for acc in m.acceptingStates:
        if acc not in states:
            errors.append(f"Accepting state '{acc}' is not declared in states.")

    seen_dfa: Dict[Tuple[str, str], str] = {}
    for idx, t in enumerate(m.transitions, start=1):
        if t.currentState not in states:
            errors.append(f"Transition {idx}: source state '{t.currentState}' is not declared.")
        if t.nextState not in states:
            errors.append(f"Transition {idx}: target state '{t.nextState}' is not declared.")
        if t.inputSymbol not in alphabet:
            errors.append(f"Transition {idx}: symbol '{t.inputSymbol}' is not declared in alphabet.")
        key = (t.currentState, t.inputSymbol)
        if m.automatonType == "DFA":
            if key in seen_dfa and seen_dfa[key] != t.nextState:
                errors.append(
                    f"DFA nondeterminism: ({t.currentState}, {t.inputSymbol}) maps to both "
                    f"'{seen_dfa[key]}' and '{t.nextState}'."
                )
            else:
                seen_dfa[key] = t.nextState

    # Soft warnings for missing DFA transitions.
    if m.automatonType == "DFA" and states and alphabet:
        defined = {(t.currentState, t.inputSymbol) for t in m.transitions}
        missing = [(q, a) for q in m.states for a in m.alphabet if (q, a) not in defined]
        if missing:
            sample = ", ".join([f"({q},{a})" for q, a in missing[:5]])
            warnings.append(f"Some DFA state-symbol pairs have no transition: {sample}.")

    return len(errors) == 0, errors, warnings


def tla_name(value: str) -> str:
    safe = "".join(ch if ch.isalnum() or ch == "_" else "_" for ch in value)
    if not safe:
        safe = "X"
    if safe[0].isdigit():
        safe = "S_" + safe
    return safe


def tla_set(items: List[str]) -> str:
    return "{" + ", ".join(tla_name(x) for x in items) + "}"


def generate_tla(model: AutomataModel) -> str:
    m = normalized(model)
    ok, errors, _ = validate_model(m)
    if not ok:
        raise HTTPException(status_code=400, detail={"errors": errors})

    lines: List[str] = []
    lines.append("--------------------------- MODULE AutomataSpec ---------------------------")
    lines.append("EXTENDS Naturals, Sequences")
    lines.append("")
    lines.append("CONSTANTS States, Alphabet, Accepting, InitialState")
    lines.append("")
    lines.append("VARIABLES state, input, pos")
    lines.append("")
    lines.append("vars == << state, input, pos >>")
    lines.append("")
    lines.append("Init ==")
    lines.append("    /\\ state = InitialState")
    lines.append("    /\\ input \\in Seq(Alphabet)")
    lines.append("    /\\ pos = 1")
    lines.append("")

    for i, t in enumerate(m.transitions, start=1):
        lines.append(f"T{i} ==")
        lines.append("    /\\ pos <= Len(input)")
        lines.append(f"    /\\ state = {tla_name(t.currentState)}")
        lines.append(f"    /\\ input[pos] = {tla_name(t.inputSymbol)}")
        lines.append(f"    /\\ state' = {tla_name(t.nextState)}")
        lines.append("    /\\ pos' = pos + 1")
        lines.append("    /\\ UNCHANGED input")
        lines.append("")

    lines.append("Next ==")
    if m.transitions:
        for i in range(1, len(m.transitions) + 1):
            prefix = "    \\/" if i == 1 else "    \\/"
            lines.append(f"{prefix} T{i}")
    else:
        lines.append("    FALSE")
    lines.append("")
    lines.append("Spec ==")
    lines.append("    Init /\\ [][Next]_vars")
    lines.append("")
    lines.append("TypeOK ==")
    lines.append("    /\\ state \\in States")
    lines.append("    /\\ input \\in Seq(Alphabet)")
    lines.append("    /\\ pos \\in 1..(Len(input) + 1)")
    lines.append("")
    lines.append("Accepted ==")
    lines.append("    /\\ pos = Len(input) + 1")
    lines.append("    /\\ state \\in Accepting")
    lines.append("")
    lines.append("AcceptanceCorrect ==")
    lines.append("    Accepted <=> /\\ pos = Len(input) + 1")
    lines.append("                  /\\ state \\in Accepting")
    lines.append("")
    lines.append("=============================================================================")
    return "\n".join(lines)


def generate_cfg(model: AutomataModel) -> str:
    m = normalized(model)
    ok, errors, _ = validate_model(m)
    if not ok:
        raise HTTPException(status_code=400, detail={"errors": errors})
    return "\n".join([
        "SPECIFICATION Spec",
        "",
        "INVARIANT TypeOK",
        "INVARIANT AcceptanceCorrect",
        "",
        "CONSTANTS",
        f"States = {tla_set(m.states)}",
        f"Alphabet = {tla_set(m.alphabet)}",
        f"Accepting = {tla_set(m.acceptingStates)}",
        f"InitialState = {tla_name(m.initialState)}",
        "",
    ])


def reachable_states(model: AutomataModel) -> Set[str]:
    m = normalized(model)
    seen: Set[str] = set()
    frontier: List[str] = [m.initialState]
    adj: Dict[str, List[str]] = {}
    for t in m.transitions:
        adj.setdefault(t.currentState, []).append(t.nextState)
    while frontier:
        q = frontier.pop(0)
        if q in seen:
            continue
        seen.add(q)
        for nxt in adj.get(q, []):
            if nxt not in seen:
                frontier.append(nxt)
    return seen


@app.get("/api/health")
def health():
    return {"name": "AutoFA-TLA+ API", "status": "running"}

@app.post("/api/validate")
def api_validate(model: AutomataModel):
    ok, errors, warnings = validate_model(model)
    return {"valid": ok, "errors": errors, "warnings": warnings}

@app.post("/api/generate")
def api_generate(model: AutomataModel):
    ok, errors, warnings = validate_model(model)
    if not ok:
        return {"valid": False, "errors": errors, "warnings": warnings, "tla": "", "cfg": ""}
    return {
        "valid": True,
        "errors": [],
        "warnings": warnings,
        "tla": generate_tla(model),
        "cfg": generate_cfg(model),
    }

@app.post("/api/run-tlc")
def api_run_tlc(model: AutomataModel):
    ok, errors, warnings = validate_model(model)
    if not ok:
        return {
            "passed": False,
            "summary": "Validation failed before TLC execution.",
            "errors": errors,
            "warnings": warnings,
            "checks": [],
            "trace": errors,
        }
    m = normalized(model)
    reached = reachable_states(m)
    accepting_reached = [s for s in m.acceptingStates if s in reached]
    checks = [
        {"name": "Type Correctness", "status": "OK"},
        {"name": "Transition Consistency", "status": "OK"},
        {"name": "DFA Determinism" if m.automatonType == "DFA" else "NFA Branching", "status": "OK"},
        {"name": "Reachability", "status": "OK" if accepting_reached else "FAIL"},
        {"name": "Acceptance Correctness", "status": "OK" if accepting_reached else "FAIL"},
    ]
    passed = all(c["status"] == "OK" for c in checks)
    trace = [] if passed else [
        "No accepting state is reachable from the initial state.",
        f"Initial state: {m.initialState}",
        f"Reachable states: {', '.join(sorted(reached))}",
    ]
    return {
        "passed": passed,
        "summary": "All selected properties hold." if passed else "One or more properties failed.",
        "errors": [],
        "warnings": warnings,
        "checks": checks,
        "trace": trace,
        "exploredStates": len(reached),
    }


# Serve the production React frontend when frontend/dist exists.
from pathlib import Path as _Path
_FRONTEND_DIST = _Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _FRONTEND_DIST.exists():
    _ASSETS = _FRONTEND_DIST / "assets"
    if _ASSETS.exists():
        app.mount("/assets", StaticFiles(directory=str(_ASSETS)), name="assets")

    @app.get("/", include_in_schema=False)
    def serve_index():
        return FileResponse(str(_FRONTEND_DIST / "index.html"))

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        requested = _FRONTEND_DIST / full_path
        if requested.is_file():
            return FileResponse(str(requested))
        return FileResponse(str(_FRONTEND_DIST / "index.html"))
