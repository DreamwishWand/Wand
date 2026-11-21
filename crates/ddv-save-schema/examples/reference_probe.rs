//! One JSON input per stdin line, one anonymous DB-05 report per stdout line.
//! Synthetic CI parity probe; not a decrypted save importer or Writer.
//! Do not log input or decoder errors, even on malformed lines.
use ddv_save_schema::probe_save_references_json;
use std::io::{self, BufRead, Write};

fn main() {
    let stdin = io::stdin();
    let mut stdout = io::BufWriter::new(io::stdout().lock());
    for line in stdin.lock().lines() {
        let Ok(decoded) = line else { std::process::exit(1); };
        let result = probe_save_references_json(&decoded);
        if writeln!(stdout, "{result}").is_err() { std::process::exit(1); }
    }
}
