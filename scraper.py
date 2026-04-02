"""
CES Idaho Events Calendar — Web Scraper
Extensible parser system for scraping organization calendars.

Usage:
    python scraper.py              # Scrape all active sources
    python scraper.py --source IAC # Scrape specific source
    python scraper.py --dry-run    # Preview without writing to DB
    python scraper.py --export-json events_data.json  # Export future events to JSON

Schedule with cron for weekend auto-updates:
    0 6 * * 6 cd /opt/ces-api && /opt/ces-api/venv/bin/python scraper.py >> scrape.log 2>&1
"""

import re
import sys
import json
import hashlib
import argparse
import os
from datetime import datetime, timedelta
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

def get_conn():
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "127.0.0.1"),
        port=os.getenv("DB_PORT", "5432"),
        dbname=os.getenv("DB_NAME", "qibrain"),
        user=os.getenv("DB_USER", "quietimpact_user"),
        password=os.getenv("DB_PASSWORD", ""),
    )

# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

HEADERS = {
    "User-Agent": "CES-Idaho-Calendar-Bot/1.0 (internal use; contact steveb1@doorstep.us)"
}


def fetch_page(url, timeout=30):
    """Fetch a URL and return HTML text, or None on failure."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=timeout)
        resp.raise_for_status()
        return resp.text
    except requests.RequestException as e:
        print(f"  [ERROR] Failed to fetch {url}: {e}")
        return None


# ---------------------------------------------------------------------------
# Parsers — one function per site structure
# ---------------------------------------------------------------------------

def parse_iac(html, base_url):
    """Parse the IAC events calendar at idcounties.org/events-training/calendar/"""
    soup = BeautifulSoup(html, "html.parser")
    events = []

    for img in soup.find_all("img"):
        alt = img.get("alt", "").strip()
        if not alt or alt.startswith("http"):
            continue

        parent = img.find_parent(["a", "li", "div"])
        if not parent:
            continue

        links = parent.find_all("a") if parent else []
        event_url = None
        for link in links:
            href = link.get("href", "")
            if "/events/" in href:
                event_url = urljoin(base_url, href)
                break

        if not event_url and img.find_parent("a"):
            href = img.find_parent("a").get("href", "")
            if "/events/" in href:
                event_url = urljoin(base_url, href)

        container = img.find_parent(["li", "div", "article"])
        if not container:
            continue

        date_text = container.get_text()
        date_match = re.search(
            r"(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})",
            date_text,
        )
        if not date_match:
            continue

        day, month_str, year = date_match.groups()
        try:
            event_date = datetime.strptime(f"{day} {month_str} {year}", "%d %b %Y").strftime("%Y-%m-%d")
        except ValueError:
            continue

        location = None
        if "\u2013" in alt:
            parts = alt.split("\u2013")
            if len(parts) == 2:
                location = parts[1].strip()

        ext_id = event_url or hashlib.md5(f"iac-{alt}-{event_date}".encode()).hexdigest()

        events.append({
            "title": alt,
            "event_date": event_date,
            "end_date": None,
            "location": location,
            "description": None,
            "url": event_url,
            "ext_id": ext_id,
        })

    print(f"  Parsed {len(events)} events from IAC")
    return events


def parse_claude_ai(html, base_url, org_name):
    """Send HTML to Claude for extraction. Requires ANTHROPIC_API_KEY."""
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        print("  [SKIP] No ANTHROPIC_API_KEY set, skipping AI extraction")
        return []

    # Clean HTML
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup.find_all(["script", "style", "nav", "footer", "header", "noscript"]):
        tag.decompose()
    cleaned = str(soup)
    if len(cleaned) > 80000:
        cleaned = cleaned[:80000] + "\n<!-- TRUNCATED -->"

    today = datetime.now().strftime("%Y-%m-%d")
    prompt = f"""You are analyzing a web page from "{org_name}" to extract calendar events.
The page URL is: {base_url}

Below is the cleaned HTML. Extract ALL events/meetings/trainings/conferences.

For each event, return a JSON object with:
- "title": string
- "event_date": string (YYYY-MM-DD)
- "end_date": string or null
- "location": string or null
- "url": string or null (absolute URL)
- "description": string or null

Return ONLY a JSON array. No explanation, no markdown, no backticks.
If no events found, return []
Today is {today}. Make URLs absolute using: {base_url}

HTML:
{cleaned}"""

    print(f"  Sending to Claude ({len(cleaned):,} chars)...")
    try:
        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "Content-Type": "application/json",
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
            },
            json={
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 4000,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=60,
        )
        resp.raise_for_status()
        data = resp.json()
        text = ""
        for block in data.get("content", []):
            if block.get("type") == "text":
                text += block["text"]

        jm = re.search(r"\[[\s\S]*\]", text)
        if not jm:
            print("  [WARN] No JSON array in Claude response")
            return []

        events = json.loads(jm.group())
        valid = []
        for e in events:
            if e.get("title") and e.get("event_date") and re.match(r"^\d{4}-\d{2}-\d{2}$", e["event_date"]):
                e["ext_id"] = e.get("url") or hashlib.md5(f"{e['title']}-{e['event_date']}".encode()).hexdigest()
                valid.append(e)

        print(f"  Claude extracted {len(valid)} events")
        return valid
    except Exception as e:
        print(f"  [ERROR] Claude API call failed: {e}")
        return []


# Parser registry
PARSERS = {
    "iac": lambda html, url, _: parse_iac(html, url),
    "claude_ai": parse_claude_ai,
}


# ---------------------------------------------------------------------------
# Scrape orchestration
# ---------------------------------------------------------------------------

def scrape_source(conn, source, dry_run=False):
    """Scrape a single source and upsert events."""
    sid = source["id"]
    parser_type = source["parser_type"]
    url = source["url"]
    org = source["org_name"]

    print(f"\n[{source['org_abbrev']}] {org}")
    print(f"  URL: {url}")
    print(f"  Parser: {parser_type}")

    if parser_type == "manual":
        print("  [SKIP] Manual source, no auto-scrape")
        return 0

    parser = PARSERS.get(parser_type)
    if not parser:
        print(f"  [SKIP] Unknown parser type: {parser_type}")
        return 0

    html = fetch_page(url)
    if not html:
        return 0

    events = parser(html, url, org)
    if not events:
        return 0

    if dry_run:
        for e in events:
            print(f"  [DRY] {e['event_date']} - {e['title']}")
        return len(events)

    # Upsert events
    cur = conn.cursor()
    added = 0
    for e in events:
        try:
            cur.execute("""
                INSERT INTO events (source_id, title, event_date, end_date, location, description, url, ext_id, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, now())
                ON CONFLICT (source_id, ext_id) DO UPDATE SET
                    title = EXCLUDED.title,
                    event_date = EXCLUDED.event_date,
                    end_date = EXCLUDED.end_date,
                    location = EXCLUDED.location,
                    description = EXCLUDED.description,
                    url = EXCLUDED.url,
                    updated_at = now()
            """, (sid, e["title"], e["event_date"], e.get("end_date"),
                  e.get("location"), e.get("description"), e.get("url"), e["ext_id"]))
            added += 1
        except Exception as ex:
            print(f"  [ERROR] Failed to insert event: {ex}")
            conn.rollback()

    # Update last_scraped
    cur.execute("UPDATE calendar_sources SET last_scraped = now(), updated_at = now() WHERE id = %s", (sid,))
    conn.commit()
    print(f"  Upserted {added} events")
    return added


def scrape_all(source_filter=None, dry_run=False):
    """Scrape all active sources (or a specific one)."""
    conn = get_conn()
    cur = conn.cursor()

    query = "SELECT id, org_name, org_abbrev, url, parser_type FROM calendar_sources WHERE active = true"
    params = []
    if source_filter:
        query += " AND org_abbrev = %s"
        params.append(source_filter)
    query += " ORDER BY org_name"

    cur.execute(query, params)
    columns = [desc[0] for desc in cur.description]
    sources = [dict(zip(columns, row)) for row in cur.fetchall()]

    if not sources:
        print("No matching active sources found.")
        return

    print(f"=== CES Calendar Scraper ===")
    print(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"Sources: {len(sources)}")
    if dry_run:
        print("Mode: DRY RUN")

    total = 0
    for source in sources:
        total += scrape_source(conn, source, dry_run)

    print(f"\n=== Done. {total} events processed. ===")
    conn.close()


def export_events_json(filepath):
    """Export all future events to a JSON file."""
    conn = get_conn()
    cur = conn.cursor()
    today = datetime.now().strftime("%Y-%m-%d")
    cur.execute("""
        SELECT e.id, e.title, e.event_date::text, e.end_date::text, e.location,
               e.description, e.url, cs.org_abbrev as org, cs.color
        FROM events e
        JOIN calendar_sources cs ON cs.id = e.source_id
        WHERE e.event_date >= %s AND cs.active = true
        ORDER BY e.event_date, e.title
    """, (today,))
    columns = [desc[0] for desc in cur.description]
    events = [dict(zip(columns, row)) for row in cur.fetchall()]
    conn.close()

    with open(filepath, "w") as f:
        json.dump(events, f, indent=2)
    print(f"Exported {len(events)} events to {filepath}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="CES Calendar Scraper")
    parser.add_argument("--source", help="Scrape specific source by abbreviation")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    parser.add_argument("--export-json", metavar="FILE", help="Export events to JSON file")
    args = parser.parse_args()

    if args.export_json:
        export_events_json(args.export_json)
    else:
        scrape_all(source_filter=args.source, dry_run=args.dry_run)
