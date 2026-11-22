"""Conservative, source-bounded follow-ups for private original PE64 reference audits.

Only an exact 5-byte x86-64 JMP rel32 may be followed without PE .pdata.
The destination still must have a complete unwind entry. RIP references
are classified by original section and file backing; mutable data is never
declared equivalent from matching initial bytes.
"""
from __future__ import annotations

import re

EXECUTE = 0x20000000
WRITE = 0x80000000
READ_WIDTHS = {
    "BYTE": 1, "WORD": 2, "DWORD": 4, "QWORD": 8,
    "XMMWORD": 16, "YMMWORD": 32, "ZMMWORD": 64,
}
RIP_MEMORY = re.compile(
    r"\b(BYTE|WORD|DWORD|QWORD|XMMWORD|YMMWORD|ZMMWORD)\s+PTR\s+\[rip[+-]",
    re.IGNORECASE,
)


def follow_rel32_thunk(pe, raw, rva, *, max_hops=2):
    """(exact PE unwind target RVA, hops), or None; no guessed leaf boundaries."""
    if type(rva) is not int or rva < 0 or type(max_hops) is not int or (
            not 1 <= max_hops <= 4):
        return None
    if rva in pe.runtime_ends:
        return rva, 0
    visited = set()
    for hop in range(1, max_hops + 1):
        if rva in visited:
            return None
        visited.add(rva)
        try:
            offset = pe.va_to_file(pe.image_base + rva, 5, executable=True)
        except ValueError:
            return None
        # E9 is exactly JMP rel32. Reject indirect jumps, other instructions
        # or incomplete bytes rather than treating arbitrary code as thunks.
        if offset < 0 or offset + 5 > len(raw) or raw[offset] != 0xe9:
            return None
        disp = int.from_bytes(raw[offset + 1:offset + 5], "little",
                              signed=True)
        rva += 5 + disp
        if not 0 <= rva <= 0xffffffff:
            return None
        if rva in pe.runtime_ends:
            return rva, hop
    return None


def _source_section(pe, rva, width):
    """Inspect *virtual* sections, including initialized-vs-zero-fill gaps."""
    if type(rva) is not int or rva < 0 or type(width) is not int or (
            not 0 <= width <= 64):
        return "invalid", None
    matches = [
        (va, vsize, raw_size, file_offset, flags)
        for va, vsize, raw_size, file_offset, flags in pe.virtual_sections
        if va <= rva and width <= vsize - (rva - va)
    ]
    if len(matches) != 1:
        return "outside_virtual_image", None
    va, _, raw_size, file_offset, flags = matches[0]
    relative = rva - va
    if relative >= raw_size:
        backing = "zero_fill"
    elif relative + width <= raw_size:
        backing = "file_backed"
    else:
        backing = "mixed_backing"
    mutability = (
        "executable" if flags & EXECUTE else
        "writable" if flags & WRITE else "read_only")
    return mutability + "_" + backing, (
        file_offset + relative if backing == "file_backed" else None)


def classify_rip_source_pair(pe_a, raw_a, rva_a, operand_a,
                             pe_b, raw_b, rva_b, operand_b,
                             opcode_a=None, opcode_b=None):
    """Classify RVA references without asserting semantic equivalence.

    Returns only a provenance category, never offsets, bytes or original
    values. Even identical original writable bytes can mutate at runtime.
    """
    if not isinstance(operand_a, str) or not isinstance(operand_b, str):
        return "unknown_rip_access"
    m_a, m_b = RIP_MEMORY.search(operand_a), RIP_MEMORY.search(operand_b)
    # Address-only references such as LEA [rip+disp32] have no memory
    # access width. Other missing widths are unresolved, not guessed.
    if m_a is None and m_b is None:
        if opcode_a != "lea" or opcode_b != "lea":
            return "unknown_rip_access"
        a, _ = _source_section(pe_a, rva_a, 0)
        b, _ = _source_section(pe_b, rva_b, 0)
        return ("address_only_" + a if a == b else "address_only_mismatch")
    if m_a is None or m_b is None:
        return "mismatched_rip_access"
    width_a, width_b = READ_WIDTHS[m_a.group(1).upper()], READ_WIDTHS[
        m_b.group(1).upper()]
    if width_a != width_b:
        return "mismatched_rip_access"
    a, off_a = _source_section(pe_a, rva_a, width_a)
    b, off_b = _source_section(pe_b, rva_b, width_b)
    if a != b:
        return "source_section_or_backing_mismatch"
    if a == "read_only_file_backed":
        if off_a is None or off_b is None or (
                off_a + width_a > len(raw_a) or
                off_b + width_b > len(raw_b)):
            return "read_only_source_bounds_unverified"
        return ("read_only_initial_bytes_identical" if
                raw_a[off_a:off_a + width_a] ==
                raw_b[off_b:off_b + width_b] else
                "read_only_initial_bytes_different")
    # Mutable initial data and BSS are NOT proof of equivalent runtime state.
    return a
