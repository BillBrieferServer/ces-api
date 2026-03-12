"""
auth_email.py - Email functions for CES authentication.
Sends plain text emails via IONOS SMTP.
"""

import os
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from typing import Tuple

logger = logging.getLogger(__name__)

ORG_NAME = os.getenv("ORG_NAME", "CES Idaho")

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.ionos.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
SMTP_FROM_NAME = ORG_NAME
SMTP_FROM_EMAIL = os.getenv("FROM_EMAIL", SMTP_USER)

APP_BASE_URL = os.getenv("APP_BASE_URL", "https://ces.quietimpact.ai")
SITE_DOMAIN = APP_BASE_URL.replace("https://", "").replace("http://", "").rstrip("/")

SUPPORT_EMAIL = SMTP_USER


def send_email(to_email: str, subject: str, body: str, max_retries: int = 3) -> Tuple[bool, str]:
    if not SMTP_PASS:
        logger.error("SMTP_PASS not configured")
        return False, "Email configuration error"

    msg = MIMEMultipart()
    msg["From"] = f"{SMTP_FROM_NAME} <{SMTP_FROM_EMAIL}>"
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))

    last_error = ""
    for attempt in range(max_retries):
        try:
            server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30)
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.send_message(msg)
            server.quit()
            logger.info(f"Email sent to {to_email}: {subject}")
            return True, "Email sent successfully"
        except smtplib.SMTPAuthenticationError as e:
            last_error = f"SMTP auth failed: {e}"
            logger.error(last_error)
            break
        except Exception as e:
            last_error = f"Email error: {e}"
            logger.warning(f"Attempt {attempt + 1} failed: {last_error}")

    return False, last_error


def send_signup_verification_code(to_email: str, code: str) -> Tuple[bool, str]:
    subject = f"Your {ORG_NAME} verification code"
    body = f"""Your verification code is: {code}

This code will expire in 15 minutes.

Enter this code on the {ORG_NAME} website to complete your registration.

If you didn't request this code, please ignore this email.

---
{ORG_NAME}
A service of Quiet Impact"""
    return send_email(to_email, subject, body)


def send_welcome_email(to_email: str, name: str, **kwargs) -> Tuple[bool, str]:
    subject = f"Welcome to {ORG_NAME}"
    body = f"""Welcome, {name}!

Your {ORG_NAME} account is now active.

Log in at {SITE_DOMAIN} to get started.

---
{ORG_NAME}
A service of Quiet Impact"""
    return send_email(to_email, subject, body)


def send_login_mfa_code(to_email: str, code: str) -> Tuple[bool, str]:
    subject = f"{ORG_NAME} login verification"
    body = f"""Your login verification code is: {code}

This code will expire in 10 minutes.

If you didn't attempt to log in, please change your password immediately.

---
{ORG_NAME}
A service of Quiet Impact"""
    return send_email(to_email, subject, body)


def send_password_reset_code(to_email: str, code: str) -> Tuple[bool, str]:
    subject = f"Reset your {ORG_NAME} password"
    body = f"""Your password reset code is: {code}

This code will expire in 10 minutes.

If you didn't request a password reset, please ignore this email.

---
{ORG_NAME}
A service of Quiet Impact"""
    return send_email(to_email, subject, body)


def send_password_changed_notification(to_email: str) -> Tuple[bool, str]:
    now = datetime.now()
    subject = f"Your {ORG_NAME} password was changed"
    body = f"""Your password was successfully changed on {now.strftime("%B %d, %Y")} at {now.strftime("%I:%M %p")}.

All active sessions have been logged out. You'll need to log in again.

If you didn't make this change, please contact us immediately.

---
{ORG_NAME}
A service of Quiet Impact"""
    return send_email(to_email, subject, body)


def send_new_device_login_alert(to_email, device_info, location, login_time=None):
    if login_time is None:
        login_time = datetime.now()
    subject = f"New login to your {ORG_NAME} account"
    body = f"""A new login was detected:

Date/Time: {login_time.strftime("%B %d, %Y")} at {login_time.strftime("%I:%M %p")}
Device: {device_info}
Location: {location}

If this wasn't you, please change your password immediately.

---
{ORG_NAME}
A service of Quiet Impact"""
    return send_email(to_email, subject, body)


def send_account_locked_notification(to_email: str, lock_minutes: int) -> Tuple[bool, str]:
    subject = f"Security Alert - {ORG_NAME} account locked"
    body = f"""Your account has been temporarily locked due to multiple failed login attempts.

It will unlock automatically in {lock_minutes} minutes.

---
{ORG_NAME}
A service of Quiet Impact"""
    return send_email(to_email, subject, body)


def test_email_configuration() -> Tuple[bool, str]:
    if not SMTP_PASS:
        return False, "SMTP_PASS not configured"
    try:
        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30)
        server.starttls()
        server.login(SMTP_USER, SMTP_PASS)
        server.quit()
        return True, "SMTP configuration valid"
    except Exception as e:
        return False, f"SMTP error: {e}"
