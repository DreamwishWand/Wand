//! CI-only synthetic decoded documents; never pass owner-private saves here.
use ddv_save_schema::probe_unified_shape_json;
use std::io::{self, BufRead, Write};
fn main() {
    let mut out = io::BufWriter::new(io::stdout().lock());
    for line in io::stdin().lock().lines() {
        let Ok(input) = line else { std::process::exit(1); };
        if writeln!(out, "{}", probe_unified_shape_json(&input)).is_err() {
            std::process::exit(1);
        }
    }
}
