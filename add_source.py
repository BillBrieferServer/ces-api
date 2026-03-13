"""
CES Idaho Events Calendar — Auto-Parser
Feed it a URL and an org name. It fetches the page, sends the HTML to Claude,
and Claude extracts the events.

Usage:
    python add_source.py "https://idcounties.org/events-training/calendar/" "IAC" --color "#1E3A5F"
    python add_source.py "https://some-county.org/meetings" "Bannock County" --abbrev "BNCK"
    python add_source.py --list                    # Show all configured sources
    python add_source.py --rescrape "IAC"          # Re-run AI extraction for a source

Requires: ANTHROPIC_API_KEY environment variable
"""

import os
import sys
import json
import argparse
import hashlib
import re
from datetime import datetime

import requests
from bs4 import BeautifulSoup
import psycopg2
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = "claude-sonnet-4-20250514"
HEADERS = {"User-Agent": "CES-Idaho-Calendar-Bot/1.0 (internal use)"}


def get_conn():
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "127.0.0.1"),
        port=os.getenv("DB_PORT", "5432"),
        dbname=os.getenv("DB_NAME", "qibrain"),
        user=os.getenv("DB_USER", "quietimpact_user"),
        password=os.getenv("DB_PASSWORD", ""),
    )


# ---------------------------------------------------------------------------
# Fetch and clean HTML
# ---------------------------------------------------------------------------

def fetch_and_clean(url, max_chars=80000):
    """Fetch a URL and return cleaned HTML suitable for Claude analysis."""
    print(f"  Fetching {url}...")
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    html = resp.text

    soup = BeautifulSoup(html, "html.parser")
    for tag in soup.find_all(["script", "style", "nav", "footer", "header", "noscript"]):
        tag.decompose()
    cleaned = str(soup)
    if len(cleaned) > max_chars:
        cleaned = cleaned[:max_chars] + "\n<!-- TRUNCATED -->"
    return cleaned


# ---------------------------------------------------------------------------
# Claude API call for event extraction
# ---------------------------------------------------------------------------

def extract_events_with_claude(html, url, org_name):
    """Send page HTML to Claude and get back structured event data."""
    if not ANTHROPIC_API_KEY:
        print("  [ERROR] ANTHROPIC_API_KEY not set.")
        sys.exit(1)

    today = datetime.now().strftime("%Y-%m-%d")
    prompt = f"""You are analyzing a web page from "{org_name}" to extract calendar events.
The page URL is: {url}

Below is the cleaned HTML. Extract ALL events/meetings/trainings/conferences.

For each event, return a JSON object with:
- "title": string (event name, cleaned up)
- "event_date": string (ISO YYYY-MM-DD)
- "end_date": string or null (YYYY-MM-DD, for multi-day events)
- "location": string or null
- "url": string or null (absolute URL)
- "description": string or null

Return ONLY a JSON array. No explanation, no markdown, no backticks.
If no events found, return []
Today is {today}. Make URLs absolute using: {url}

HTML:
{html}"""

    print(f"  Sending to Claude ({len(html):,} chars)...")
    api_resp = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
        },
        json={
            "model": ANTHROPIC_MODEL,
            "max_tokens": 4000,
            "messages": [{"role": "user", "content": prompt}],
        },
        timeout=60,
    )
    api_resp.raise_for_status()
    data = api_resp.json()

    text = ""
    for block in data.get("content", []):
        if block.get("type") == "text":
            text += block["text"]

    jm = re.search(r"\[[\s\S]*\]", text)
    if not jm:
        print("  No JSON array found in Claude response.")
        return []

    events = json.loads(jm.group())
    valid = []
    for e in events:
        if e.get("title") and e.get("event_date") and re.match(r"^\d{4}-\d{2}-\d{2}$", e["event_date"]):
            e["ext_id"] = e.get("url") or hashlib.md5(f"{e['title']}-{e['event_date']}".encode()).hexdigest()
            valid.append(e)

    return valid


# ---------------------------------------------------------------------------
# Source management
# ---------------------------------------------------------------------------

def list_sources():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT cs.org_abbrev, cs.org_name, cs.parser_type, cs.color, cs.active,
               cs.last_scraped::text, COUNT(e.id) as events
        FROM calendar_sources cs
        LEFT JOIN events e ON e.source_id = cs.id
        GROUP BY cs.id ORDER BY cs.org_name
    """)
    print(f"\n{'Abbrev':<8} {'Organization':<35} {'Parser':<12} {'Events':>6} {'Last Scraped'}")
    print("-" * 90)
    for row in cur.fetchall():
        abbrev, name, parser, color, active, last, count = row
        status = "" if active else " [INACTIVE]"
        print(f"{abbrev:<8} {name:<35} {parser:<12} {count:>6} {last or 'never'}{status}")
    conn.close()


def add_source(url, org_name, abbrev=None, color="#2563EB", dry_run=False):
    """Add a new calendar source and extract its events."""
    if not abbrev:
        abbrev = "".join(w[0] for w in org_name.split() if w[0].isupper())[:6] or org_name[:4].upper()

    print(f"\n=== Adding source: {org_name} ({abbrev}) ===")
    print(f"URL: {url}")
    print(f"Color: {color}")

    html = fetch_and_clean(url)
    events = extract_events_with_claude(html, url, org_name)

    if not events:
        print("No events found. Source not added.")
        return

    print(f"\nFound {len(events)} events:")
    for e in events:
        end = f" - {e.get('end_date')}" if e.get("end_date") else ""
        loc = f" ({e.get('location')})" if e.get("location") else ""
        print(f"  {e['event_date']}{end} {e['title']}{loc}")

    if dry_run:
        print("\n[DRY RUN] No changes made.")
        return

    conn = get_conn()
    cur = conn.cursor()

    # Insert source
    cur.execute("""
        INSERT INTO calendar_sources (org_name, org_abbrev, url, parser_type, color)
        VALUES (%s, %s, %s, 'claude_ai', %s)
        RETURNING id
    """, (org_name, abbrev, url, color))
    source_id = cur.fetchone()[0]

    # Insert events
    added = 0
    for e in events:
        try:
            cur.execute("""
                INSERT INTO events (source_id, title, event_date, end_date, location, description, url, ext_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (source_id, ext_id) DO NOTHING
            """, (source_id, e["title"], e["event_date"], e.get("end_date"),
                  e.get("location"), e.get("description"), e.get("url"), e["ext_id"]))
            added += 1
        except Exception as ex:
            print(f"  [ERROR] {ex}")

    conn.commit()
    conn.close()
    print(f"\nSource added (id={source_id}). {added} events imported.")


def rescrape(abbrev):
    """Re-run scraping for an existing source."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "SELECT id, org_name, url, parser_type FROM calendar_sources WHERE org_abbrev = %s",
        (abbrev,),
    )
    row = cur.fetchone()
    if not row:
        print(f"Source '{abbrev}' not found.")
        return

    sid, org_name, url, parser_type = row
    print(f"\n=== Re-scraping: {org_name} ({abbrev}) ===")

    if parser_type == "manual":
        print("Manual source. Use --add to re-extract with AI.")
        return

    html = fetch_and_clean(url)
    if parser_type == "claude_ai":
        events = extract_events_with_claude(html, url, org_name)
    elif parser_type == "iac":
        from scraper import parse_iac
        events = parse_iac(html, url)
    else:
        print(f"Unknown parser: {parser_type}")
        return

    added = 0
    for e in events:
        try:
            cur.execute("""
                INSERT INTO events (source_id, title, event_date, end_date, location, description, url, ext_id, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, now())
                ON CONFLICT (source_id, ext_id) DO UPDATE SET
                    title = EXCLUDED.title, updated_at = now()
            """, (sid, e["title"], e["event_date"], e.get("end_date"),
                  e.get("location"), e.get("description"), e.get("url"), e["ext_id"]))
            added += 1
        except Exception as ex:
            print(f"  [ERROR] {ex}")

    cur.execute("UPDATE calendar_sources SET last_scraped = now() WHERE id = %s", (sid,))
    conn.commit()
    conn.close()
    print(f"Done. {added} events upserted.")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="CES Calendar Source Manager")
    parser.add_argument("url", nargs="?", help="Calendar page URL")
    parser.add_argument("org_name", nargs="?", help="Organization name")
    parser.add_argument("--abbrev", help="Short abbreviation")
    parser.add_argument("--color", default="#2563EB", help="Display color (hex)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--list", action="store_true", help="List all sources")
    parser.add_argument("--rescrape", metavar="ABBREV", help="Re-scrape existing source")
    args = parser.parse_args()

    if args.list:
        list_sources()
    elif args.rescrape:
        rescrape(args.rescrape)
    elif args.url and args.org_name:
        add_source(args.url, args.org_name, abbrev=args.abbrev, color=args.color, dry_run=args.dry_run)
    else:
        parser.print_help()
