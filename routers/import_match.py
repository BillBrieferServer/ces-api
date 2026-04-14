"""
Composite scoring for import matching (officials + vendors).

Score an incoming row against candidate existing records across multiple
signals (email, phone, name, title, jurisdiction/company). The caller
supplies field-map + candidate list; this module handles the scoring
and nickname-aware name comparison.
"""

import re
from difflib import SequenceMatcher

# Nickname lookups — bidirectional once normalized below
_NICKNAMES_RAW = {
    "ron": ["ronald", "ronnie"],
    "bob": ["robert", "rob", "bobby"],
    "rob": ["robert", "bob", "robbie"],
    "bill": ["william", "billy", "will"],
    "will": ["william", "bill", "willy"],
    "liz": ["elizabeth", "beth", "eliza", "betsy"],
    "beth": ["elizabeth", "liz"],
    "mike": ["michael", "mickey"],
    "jim": ["james", "jimmy", "jamie"],
    "jimmy": ["james", "jim"],
    "dave": ["david", "davey"],
    "joe": ["joseph", "joey"],
    "tony": ["anthony", "antonio"],
    "tom": ["thomas", "tommy"],
    "dan": ["daniel", "danny"],
    "matt": ["matthew", "matty"],
    "nick": ["nicholas", "nicky"],
    "chris": ["christopher", "christian", "christine", "christina"],
    "steve": ["steven", "stephen", "stevie"],
    "ed": ["edward", "eddie", "edmund"],
    "ted": ["theodore", "edward"],
    "sam": ["samuel", "samantha", "sammy"],
    "alex": ["alexander", "alexandra", "alexis"],
    "kate": ["katherine", "kathryn", "katie", "kathleen"],
    "katie": ["katherine", "kate", "kathryn"],
    "meg": ["margaret", "megan"],
    "peggy": ["margaret"],
    "patty": ["patricia", "pat"],
    "pat": ["patricia", "patrick"],
    "sue": ["susan", "susie", "suzanne"],
    "dick": ["richard", "rick", "ricky"],
    "rick": ["richard", "dick"],
    "hank": ["henry"],
    "jack": ["john", "jackson"],
    "jake": ["jacob"],
    "zach": ["zachary"],
    "andy": ["andrew"],
    "drew": ["andrew"],
    "ben": ["benjamin", "benny"],
    "greg": ["gregory"],
    "jen": ["jennifer", "jenny"],
    "jenny": ["jennifer", "jen"],
    "becky": ["rebecca"],
    "cathy": ["catherine", "kathy"],
    "kathy": ["katherine", "catherine"],
    "debbie": ["deborah", "debra"],
    "deb": ["deborah", "debra"],
    "cindy": ["cynthia"],
    "tricia": ["patricia"],
    "trish": ["patricia"],
    "vicki": ["victoria"],
    "tina": ["christina", "christine"],
    "terry": ["terrence", "teresa"],
    "charlie": ["charles"],
    "chuck": ["charles"],
}


def _build_nickname_map():
    m = {}
    for k, vs in _NICKNAMES_RAW.items():
        m.setdefault(k, set()).update(vs)
        for v in vs:
            m.setdefault(v, set()).add(k)
            for v2 in vs:
                if v2 != v:
                    m[v].add(v2)
    return {k: frozenset(v) for k, v in m.items()}


_NICKNAMES = _build_nickname_map()


def _norm(s):
    if not s:
        return ""
    return re.sub(r"\s+", " ", str(s).strip().lower())


def _digits(s):
    if not s:
        return ""
    return re.sub(r"\D", "", str(s))


def _normalize_email(s):
    return _norm(s)


def names_equivalent(a, b):
    """True if two first-name tokens are the same OR known nicknames."""
    a, b = _norm(a), _norm(b)
    if not a or not b:
        return False
    if a == b:
        return True
    if b in _NICKNAMES.get(a, ()):
        return True
    if a in _NICKNAMES.get(b, ()):
        return True
    return False


def _split_name(n):
    parts = [p for p in _norm(n).split(" ") if p]
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], parts[-1]


def name_similarity(a, b):
    """
    0.0–1.0 similarity between two person names.
    Rewards last-name exact match + first-name equivalence (including nicknames).
    """
    if not a or not b:
        return 0.0
    na, nb = _norm(a), _norm(b)
    if na == nb:
        return 1.0

    fa, la = _split_name(a)
    fb, lb = _split_name(b)

    last_match = la and lb and la == lb
    first_equiv = names_equivalent(fa, fb)

    if last_match and first_equiv:
        return 1.0
    if last_match and fa and fb and (fa.startswith(fb) or fb.startswith(fa)):
        return 0.9
    if last_match:
        return 0.75

    return SequenceMatcher(None, na, nb).ratio()


def _title_similarity(a, b):
    a, b = _norm(a), _norm(b)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    # Simple containment: "Sheriff" vs "County Sheriff"
    if a in b or b in a:
        return 0.8
    return SequenceMatcher(None, a, b).ratio()


def score_person_candidate(incoming, existing, jurisdiction_match="none"):
    """
    Score a person-like record (official OR vendor contact).

    jurisdiction_match: "exact" | "fuzzy" | "none"

    Returns (score, breakdown_dict).
    """
    score = 0
    parts = {}

    inc_email = _normalize_email(incoming.get("email"))
    ex_email = _normalize_email(existing.get("email"))
    if inc_email and ex_email and inc_email == ex_email:
        score += 50
        parts["email"] = 50

    inc_phone = _digits(incoming.get("phone"))
    ex_phone = _digits(existing.get("phone"))
    # also check cross-phone-fields (cell vs office)
    ex_phones = {_digits(existing.get(f)) for f in ("phone", "cell_phone", "fax")} - {""}
    inc_phones = {_digits(incoming.get(f)) for f in ("phone", "cell_phone", "fax")} - {""}
    phone_hit = bool(ex_phones & inc_phones)
    if phone_hit:
        score += 30
        parts["phone"] = 30

    name_sim = name_similarity(incoming.get("name"), existing.get("name"))
    name_pts = round(name_sim * 30)
    if name_pts:
        score += name_pts
        parts["name"] = name_pts

    title_sim = _title_similarity(incoming.get("title"), existing.get("title"))
    title_pts = round(title_sim * 20)
    if title_pts:
        score += title_pts
        parts["title"] = title_pts

    if jurisdiction_match == "exact":
        score += 10
        parts["jurisdiction"] = 10
    elif jurisdiction_match == "fuzzy":
        score += 5
        parts["jurisdiction"] = 5

    inc_role = _norm(incoming.get("role_type"))
    ex_role = _norm(existing.get("role_type"))
    if inc_role and ex_role and inc_role == ex_role:
        score += 5
        parts["role_type"] = 5

    return score, parts


def score_company_candidate(incoming, existing):
    """
    Score a vendor company candidate against incoming card extraction.

    Strong signals: website domain, email domain, phone, exact/near-exact name.
    """
    score = 0
    parts = {}

    inc_web = _norm(incoming.get("website"))
    ex_web = _norm(existing.get("website"))
    if inc_web and ex_web:
        if _domain(inc_web) == _domain(ex_web) and _domain(inc_web):
            score += 40
            parts["website"] = 40

    inc_email = _normalize_email(incoming.get("email"))
    ex_email = _normalize_email(existing.get("email"))
    if inc_email and ex_email:
        if inc_email == ex_email:
            score += 40
            parts["email"] = 40
        else:
            ia, ib = _email_domain(inc_email), _email_domain(ex_email)
            if ia and ia == ib and not _is_generic_domain(ia):
                score += 20
                parts["email_domain"] = 20

    inc_phone = _digits(incoming.get("phone"))
    ex_phone = _digits(existing.get("phone"))
    if inc_phone and ex_phone and inc_phone == ex_phone:
        score += 30
        parts["phone"] = 30

    nsim = SequenceMatcher(
        None, _norm(incoming.get("vendor_name")), _norm(existing.get("vendor_name"))
    ).ratio() if incoming.get("vendor_name") and existing.get("vendor_name") else 0.0
    npts = round(nsim * 40)
    if npts:
        score += npts
        parts["name"] = npts

    return score, parts


def _domain(url):
    if not url:
        return ""
    u = str(url).lower().strip()
    u = re.sub(r"^https?://", "", u)
    u = re.sub(r"^www\.", "", u)
    return u.split("/")[0].split("?")[0]


def _email_domain(email):
    if not email or "@" not in email:
        return ""
    return email.split("@", 1)[1].lower().strip()


_GENERIC_DOMAINS = {
    "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
    "icloud.com", "me.com", "live.com", "msn.com", "comcast.net",
    "att.net", "verizon.net", "protonmail.com",
}


def _is_generic_domain(d):
    return d.lower() in _GENERIC_DOMAINS


def band(score, person=True):
    """Return 'AUTO', 'POSSIBLE', or 'NEW' based on score."""
    if person:
        if score >= 70:
            return "AUTO"
        if score >= 40:
            return "POSSIBLE"
        return "NEW"
    else:
        if score >= 60:
            return "AUTO"
        if score >= 30:
            return "POSSIBLE"
        return "NEW"


def diff_fields(incoming, existing, fields):
    """
    Return (fill_fields, overwrite_fields) for merge preview.
    Each entry: {"field", "old", "new"}.
    """
    fill, overwrite = [], []
    for f in fields:
        new = (incoming.get(f) or "").strip() if incoming.get(f) else None
        old = (existing.get(f) or "").strip() if existing.get(f) else None
        if not new:
            continue
        if new == old:
            continue
        entry = {"field": f, "old": old, "new": new}
        if not old:
            fill.append(entry)
        else:
            overwrite.append(entry)
    return fill, overwrite
