"""
CES Idaho Events Calendar — Web Scraper
Extensible parser system for scraping organization calendars.

Usage:
    python scraper.py              # Scrape all active sources
    python scraper.py --source IAC # Scrape specific source
    python scraper.py --dry-run    # Preview without writing to DB
    python scraper.py --export-json events_data.json  # Export future events to JSON

Schedule with cron for Sunday night auto-updates:
    0 5 * * 1 cd /opt/ces-api && /opt/ces-api/venv/bin/python scraper.py >> scrape.log 2>&1
"""

import re
import sys
import json
import hashlib
import argparse
import os
import time
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
# Claude AI extraction helper
# ---------------------------------------------------------------------------

def extract_events_with_claude(cleaned_html, org_label, base_url):
    """Send cleaned HTML to Claude and return a list of event dicts."""
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        print("  [SKIP] No ANTHROPIC_API_KEY set")
        return []

    if len(cleaned_html) > 80000:
        cleaned_html = cleaned_html[:80000] + "\n<!-- TRUNCATED -->"

    today = datetime.now().strftime("%Y-%m-%d")
    prompt = (
        f'You are analyzing a web page from "{org_label}" to extract calendar events.\n'
        f"The page URL is: {base_url}\n\n"
        "Below is the cleaned HTML. Extract ALL events, meetings, trainings, "
        "conferences, and webinars.\n\n"
        "For each event, return a JSON object with:\n"
        '- "title": string\n'
        '- "event_date": string (YYYY-MM-DD)\n'
        '- "end_date": string or null (YYYY-MM-DD if multi-day)\n'
        '- "location": string or null\n'
        '- "url": string or null (absolute URL)\n'
        '- "description": string or null (brief, one sentence max)\n\n'
        "Return ONLY a JSON array. No explanation, no markdown, no backticks.\n"
        "If no events found, return []\n"
        f"Today is {today}. Only include events from today onward.\n"
        f"Make all URLs absolute using base: {base_url}\n\n"
        f"HTML:\n{cleaned_html}"
    )

    print(f"  Sending to Claude ({len(cleaned_html):,} chars)...")
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
            if (e.get("title") and e.get("event_date")
                    and re.match(r"^\d{4}-\d{2}-\d{2}$", e["event_date"])):
                valid.append(e)

        print(f"  Claude extracted {len(valid)} events")
        return valid
    except Exception as e:
        print(f"  [ERROR] Claude API call failed: {e}")
        return []


def clean_html(html):
    """Strip scripts/styles/nav from HTML for Claude extraction."""
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup.find_all(["script", "style", "nav", "footer", "header", "noscript", "iframe"]):
        tag.decompose()
    return str(soup)


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
    cleaned = clean_html(html)
    events = extract_events_with_claude(cleaned, org_name, base_url)
    for e in events:
        e["ext_id"] = e.get("url") or hashlib.md5(
            f"{e['title']}-{e['event_date']}".encode()
        ).hexdigest()
    return events


# ---------------------------------------------------------------------------
# Playwright-based parsers (for sites behind Cloudflare / login walls)
# ---------------------------------------------------------------------------

def fetch_aic_calendar_html():
    """Use Playwright to log in to AIC and fetch the events calendar HTML."""
    from playwright.sync_api import sync_playwright

    username = os.environ.get("AIC_USERNAME", "")
    password = os.environ.get("AIC_PASSWORD", "")
    if not username or not password:
        print("  [ERROR] AIC_USERNAME / AIC_PASSWORD not set in .env")
        return None

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/125.0.0.0 Safari/537.36"
            )
        )
        page = context.new_page()

        print("  Navigating to login page...")
        page.goto(
            "https://idahocities.org/login.asp",
            wait_until="domcontentloaded",
            timeout=30000,
        )
        time.sleep(2)

        print("  Logging in...")
        page.fill('input[name="u"]', username)
        page.fill('input[name="p"]', password)
        page.click('input[name="btn_submitLogin"]')
        page.wait_for_load_state("domcontentloaded", timeout=15000)
        time.sleep(3)

        if "login.asp" in page.url.lower():
            print("  [ERROR] Login failed — still on login page")
            browser.close()
            return None
        print(f"  Logged in. URL: {page.url}")

        print("  Navigating to events calendar...")
        page.goto(
            "https://idahocities.org/events/event_list.asp",
            wait_until="domcontentloaded",
            timeout=30000,
        )
        time.sleep(3)
        print(f"  Calendar page URL: {page.url}")

        html = page.content()
        browser.close()

    print(f"  Got {len(html):,} chars of HTML")
    return html


def parse_playwright_aic(html, base_url, org_name):
    """Fetch AIC calendar via Playwright login, then extract events with Claude."""
    # Ignore the html/base_url args — we fetch our own via Playwright
    fetched = fetch_aic_calendar_html()
    if not fetched:
        return []

    cleaned = clean_html(fetched)
    events = extract_events_with_claude(
        cleaned,
        "Association of Idaho Cities",
        "https://idahocities.org/events/event_list.asp",
    )
    for e in events:
        e["ext_id"] = e.get("url") or hashlib.md5(
            f"aic-{e['title']}-{e['event_date']}".encode()
        ).hexdigest()
    return events


# ---------------------------------------------------------------------------
# Parser registry
# ---------------------------------------------------------------------------

PARSERS = {
    "iac": lambda html, url, _: parse_iac(html, url),
    "claude_ai": parse_claude_ai,
    "playwright_aic": parse_playwright_aic,
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

    # Playwright parsers fetch their own HTML; others use fetch_page
    if parser_type.startswith("playwright_"):
        html = None  # parser will handle fetching
    else:
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
                INSERT INTO events (source_id, title, event_date, end_date,
                                    location, description, url, ext_id, updated_at)
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
                  e.get("location"), e.get("description"), e.get("url"),
                  e["ext_id"]))
            added += 1
        except Exception as ex:
            print(f"  [ERROR] Failed to insert event: {ex}")
            conn.rollback()

    # Update last_scraped
    cur.execute(
        "UPDATE calendar_sources SET last_scraped = now(), updated_at = now() WHERE id = %s",
        (sid,),
    )
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

    print("=== CES Calendar Scraper ===")
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
