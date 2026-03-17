"""
Rebuild ces.vendors from most recent complete FY data with alias-based dedup.

Usage: python3 rebuild_vendors.py [jurisdiction_id]
  - If no jurisdiction_id given, rebuilds all jurisdictions that have claim data.
  - Auto-creates aliases for obvious matches (GRP suffixes, punctuation).
  - Fuzzy-matches remaining names and flags candidates.
  - Uses ces.vendor_aliases for all dedup decisions.

Pocatello FY runs Oct 1 - Sep 30. We use the most recent complete FY.
"""
import re
import sys
from difflib import SequenceMatcher
import psycopg2
from psycopg2.extras import execute_values

DB_PARAMS = dict(
    dbname="qibrain", user="quietimpact_user",
    host="localhost", password="ezj9QfukEXaShHcBpqN92WM4KREvvlWA"
)

# --- Name normalization (for matching, not display) ---

def normalize_for_match(name):
    """Aggressive normalization for fuzzy matching."""
    n = name.strip().upper()
    # Remove GRP/group suffixes: "ABC Bus Inc GRP A" -> "ABC Bus Inc"
    n = re.sub(r',?\s*(CK\s+)?GRP[\s-]*[A-Z0-9]*$', '', n)
    n = re.sub(r',?\s*GROUP\s+[A-Z0-9]+$', '', n)
    # Remove trailing punctuation
    n = n.rstrip('.,;')
    # Normalize suffixes
    for suffix in ['INC', 'LLC', 'LTD', 'CO', 'CORP', 'PLLC']:
        n = re.sub(rf',?\s*{suffix}\.?$', f' {suffix}', n)
    # Normalize abbreviations
    n = re.sub(r'\bCO\.\b', 'CO', n)
    n = re.sub(r'\bDEPT\.\b', 'DEPT', n)
    n = re.sub(r'\bDEPT\b', '', n)
    # Collapse whitespace
    n = re.sub(r'\s+', ' ', n).strip()
    return n


def pick_best_name(names):
    """Pick the best display name from a set of raw names."""
    # Prefer the name without GRP suffix, then longest
    no_grp = [n for n in names if not re.search(r'GRP[\s-]*[A-Z0-9]*$', n, re.I)]
    candidates = no_grp if no_grp else list(names)
    # Pick longest (usually most complete)
    return max(candidates, key=len)


def fuzzy_ratio(a, b):
    return SequenceMatcher(None, a, b).ratio()


# --- Main ---

def rebuild_jurisdiction(cur, jurisdiction_id, jname):
    print(f"\n{'='*60}")
    print(f"Processing: {jname} (id={jurisdiction_id})")
    print(f"{'='*60}")

    # Determine most recent complete FY (Oct-Sep)
    # Find the latest report_date, then figure out which FY is complete
    cur.execute("""
        SELECT MAX(report_date) FROM reference.municipal_material_claims
        WHERE jurisdiction_id = %s
    """, (jurisdiction_id,))
    latest = cur.fetchone()[0]
    if not latest:
        print("  No claim data found, skipping")
        return

    # FY runs Oct 1 - Sep 30. Use most recent COMPLETE FY.
    # If latest is in Oct+ of year X, current (incomplete) FY is X->X+1,
    # so most recent complete FY is (X-1)->X.
    # If latest is in Jan-Sep of year X, current (incomplete) FY is (X-1)->X,
    # so most recent complete FY is (X-2)->(X-1).
    if latest.month >= 10:
        # We're in a new FY that started Oct of latest.year — use prior complete FY
        fy_start = f"{latest.year - 1}-10-01"
        fy_end = f"{latest.year}-10-01"
        fy_label = f"FY{latest.year}"
    else:
        # We're mid-FY that started Oct of (latest.year-1) — use the one before
        fy_start = f"{latest.year - 2}-10-01"
        fy_end = f"{latest.year - 1}-10-01"
        fy_label = f"FY{latest.year - 1}"

    # Check if there's actually data in that FY; if not, fall back to using all available data up to latest
    cur.execute("""
        SELECT COUNT(*) FROM reference.municipal_vendor_claims vc
        JOIN reference.municipal_material_claims mc ON mc.claim_id = vc.claim_id
        WHERE mc.jurisdiction_id = %s AND mc.report_date >= %s AND mc.report_date < %s
    """, (jurisdiction_id, fy_start, fy_end))
    fy_count = cur.fetchone()[0]
    if fy_count == 0:
        # No complete FY available — use the current incomplete FY
        if latest.month >= 10:
            fy_start = f"{latest.year}-10-01"
            fy_end = f"{latest.year + 1}-10-01"
            fy_label = f"FY{latest.year + 1} (partial)"
        else:
            fy_start = f"{latest.year - 1}-10-01"
            fy_end = f"{latest.year}-10-01"
            fy_label = f"FY{latest.year} (partial)"

    print(f"  Using {fy_label}: {fy_start} to {fy_end}")

    # Pull raw vendor claims for this FY
    cur.execute("""
        SELECT vc.vendor_name, vc.amount
        FROM reference.municipal_vendor_claims vc
        JOIN reference.municipal_material_claims mc ON mc.claim_id = vc.claim_id
        WHERE mc.jurisdiction_id = %s
          AND mc.report_date >= %s AND mc.report_date < %s
    """, (jurisdiction_id, fy_start, fy_end))
    rows = cur.fetchall()
    print(f"  Raw payments: {len(rows)}")

    if not rows:
        print("  No payments in this FY, skipping")
        return

    # Collect unique raw names
    raw_names = set(r[0].strip() for r in rows)
    print(f"  Unique raw vendor names: {len(raw_names)}")

    # Load existing aliases
    cur.execute("SELECT raw_name, canonical_name FROM ces.vendor_aliases")
    aliases = {r[0]: r[1] for r in cur.fetchall()}

    # Step 1: Auto-alias obvious matches (GRP suffixes, punctuation variants)
    # Group by normalized form
    norm_groups = {}
    for name in raw_names:
        norm = normalize_for_match(name)
        norm_groups.setdefault(norm, set()).add(name)

    new_auto_aliases = 0
    for norm, names in norm_groups.items():
        if len(names) <= 1:
            continue
        # All names in this group should map to the same canonical
        canonical = pick_best_name(names)
        for name in names:
            if name not in aliases:
                aliases[name] = canonical
                cur.execute("""
                    INSERT INTO ces.vendor_aliases (raw_name, canonical_name, match_method, confidence, reviewed)
                    VALUES (%s, %s, 'auto_normalize', 1.0, true)
                    ON CONFLICT (raw_name) DO NOTHING
                """, (name, canonical))
                new_auto_aliases += 1

    print(f"  Auto-aliases created: {new_auto_aliases}")

    # Step 2: Fuzzy match remaining unaliased names
    # Get canonical names so far
    resolved = {}
    for name in raw_names:
        if name in aliases:
            resolved[name] = aliases[name]
        else:
            resolved[name] = name  # self

    # Get unique canonical names
    canonicals = list(set(resolved.values()))
    canonicals_norm = {c: normalize_for_match(c) for c in canonicals}

    new_fuzzy_aliases = 0
    fuzzy_review = []

    for name in raw_names:
        if name in aliases:
            continue
        name_norm = normalize_for_match(name)
        best_match = None
        best_ratio = 0
        for canon, canon_norm in canonicals_norm.items():
            if canon == name:
                continue
            ratio = fuzzy_ratio(name_norm, canon_norm)
            if ratio > best_ratio:
                best_ratio = ratio
                best_match = canon

        if best_match and best_ratio >= 0.92:
            # High confidence auto-merge
            aliases[name] = best_match
            cur.execute("""
                INSERT INTO ces.vendor_aliases (raw_name, canonical_name, match_method, confidence, reviewed)
                VALUES (%s, %s, 'fuzzy_auto', %s, false)
                ON CONFLICT (raw_name) DO NOTHING
            """, (name, best_match, round(best_ratio, 2)))
            new_fuzzy_aliases += 1
        elif best_match and best_ratio >= 0.82:
            fuzzy_review.append((name, best_match, best_ratio))

    print(f"  Fuzzy auto-aliases (>=92%): {new_fuzzy_aliases}")

    if fuzzy_review:
        print(f"\n  REVIEW CANDIDATES ({len(fuzzy_review)} pairs, 82-91% match):")
        for raw, canon, ratio in sorted(fuzzy_review, key=lambda x: -x[2]):
            print(f"    {ratio:.0%}  \"{raw}\" -> \"{canon}\"")

    # Step 3: Rebuild vendor data for this jurisdiction
    # Aggregate payments using aliases
    vendor_totals = {}
    for raw_name, amount in rows:
        raw_name = raw_name.strip()
        canonical = aliases.get(raw_name, raw_name)
        if canonical not in vendor_totals:
            vendor_totals[canonical] = {"total": 0, "count": 0, "raw_names": set()}
        vendor_totals[canonical]["total"] += float(amount)
        vendor_totals[canonical]["count"] += 1
        vendor_totals[canonical]["raw_names"].add(raw_name)

    # Clear existing vendor data for this jurisdiction
    cur.execute("""
        DELETE FROM ces.vendor_jurisdictions WHERE jurisdiction_id = %s
    """, (jurisdiction_id,))
    # Clean up orphaned vendors (no remaining jurisdiction links)
    cur.execute("""
        DELETE FROM ces.vendors WHERE vendor_id NOT IN (
            SELECT vendor_id FROM ces.vendor_jurisdictions
        ) AND source LIKE %s
    """, (f'%{jname}%',))

    # Insert
    source_label = f"{jname} {fy_label} claims"
    inserted = 0
    for canonical, data in sorted(vendor_totals.items(), key=lambda x: -x[1]["total"]):
        # Check if vendor already exists (from another jurisdiction)
        cur.execute("SELECT vendor_id FROM ces.vendors WHERE vendor_name = %s", (canonical,))
        row = cur.fetchone()
        if row:
            vid = row[0]
        else:
            cur.execute("""
                INSERT INTO ces.vendors (vendor_name, source)
                VALUES (%s, %s) RETURNING vendor_id
            """, (canonical, source_label))
            vid = cur.fetchone()[0]

        cur.execute("""
            INSERT INTO ces.vendor_jurisdictions (vendor_id, jurisdiction_id, relationship_type, annual_spend, source)
            VALUES (%s, %s, 'vendor', %s, %s)
            ON CONFLICT (vendor_id, jurisdiction_id) DO UPDATE SET annual_spend = EXCLUDED.annual_spend, source = EXCLUDED.source
        """, (vid, jurisdiction_id, round(data["total"], 2), source_label))
        inserted += 1

    # Show merges
    merges = [(c, d) for c, d in vendor_totals.items() if len(d["raw_names"]) > 1]
    if merges:
        print(f"\n  Merged groups:")
        for canonical, data in sorted(merges, key=lambda x: -x[1]["total"]):
            print(f"    ${data['total']:>12,.2f}  {canonical}")
            for alt in sorted(data["raw_names"]):
                if alt != canonical:
                    print(f"                  <- {alt}")

    print(f"\n  Result: {inserted} unique vendors (from {len(raw_names)} raw names)")
    print(f"  Source: {source_label}")


def main():
    conn = psycopg2.connect(**DB_PARAMS)
    conn.autocommit = False
    cur = conn.cursor()

    # Get target jurisdictions
    if len(sys.argv) > 1:
        jid = int(sys.argv[1])
        cur.execute("SELECT jurisdiction_id, name FROM common.jurisdictions WHERE jurisdiction_id = %s", (jid,))
        targets = cur.fetchall()
    else:
        cur.execute("""
            SELECT DISTINCT j.jurisdiction_id, j.name
            FROM reference.municipal_material_claims mc
            JOIN common.jurisdictions j ON j.jurisdiction_id = mc.jurisdiction_id
            ORDER BY j.name
        """)
        targets = cur.fetchall()

    if not targets:
        print("No jurisdictions with claim data found")
        return

    # Clear vendors for targeted jurisdictions before rebuild
    if len(sys.argv) <= 1:
        # Full rebuild — clear everything
        cur.execute("DELETE FROM ces.vendor_jurisdictions")
        cur.execute("DELETE FROM ces.vendors")
        print("Cleared all vendor data for full rebuild")

    for jid, jname in targets:
        rebuild_jurisdiction(cur, jid, jname)

    conn.commit()
    cur.close()
    conn.close()

    # Summary
    conn = psycopg2.connect(**DB_PARAMS)
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM ces.vendors")
    print(f"\nTotal vendors in system: {cur.fetchone()[0]}")
    cur.execute("SELECT COUNT(*) FROM ces.vendor_aliases")
    print(f"Total aliases in system: {cur.fetchone()[0]}")
    conn.close()


if __name__ == "__main__":
    main()
