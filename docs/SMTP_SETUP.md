# LouDent — SMTP & Email Configuration Guide

LouDent relies on **Supabase Auth** for all authentication emails:
- Patient email verification on sign-up
- Resend verification link
- Password reset recovery link
- Staff invitation links (when provisioning a new dentist account)

---

## 1. Built-in Supabase Auth Email (Default Free Option)

Out of the box, Supabase provides a built-in email sender for development and small university demonstrations at **$0 cost**.

### Built-in Sender Restrictions (Supabase Free Plan)
- **Rate limit**: **2–4 emails per hour** across the entire project.
- **Recipient restriction**: Intended for team/testing addresses; deliverability to public inboxes is not guaranteed.

For a classroom demonstration with 1–2 test accounts, the built-in sender works immediately without external setup, provided you pace sign-up/reset clicks (LouDent enforces a 60-second client cooldown on resend/reset requests to help protect this quota).

---

## 2. Configuring a Free Custom SMTP Provider (Recommended for Demos)

To lift Supabase's 2–4 emails/hour built-in limit while staying strictly on **$0 free-tier services**, configure Custom SMTP in **Supabase Dashboard → Authentication → SMTP Settings**.

### Option A — Brevo (formerly Sendinblue) Free Tier
- **Cost**: Free ($0/month, no credit card required)
- **Free Quota**: **300 emails/day**
- **Works without a custom domain**: You can verify a single sender email address in Brevo.
- **SMTP Settings**:
  - **Host**: `smtp-relay.brevo.com`
  - **Port**: `587`
  - **Username**: Your Brevo SMTP login (shown under *SMTP & API* in Brevo)
  - **Password**: Your Brevo SMTP master password / key
  - **Sender email**: Your verified sender email address
  - **Sender name**: `LouDent Dental Clinic`

### Option B — Gmail App Password (Personal / University Demo Only)
- **Cost**: Free ($0)
- **Free Quota**: ~100–500 recipients/day (personal account limits apply; not for commercial bulk mail)
- **SMTP Settings**:
  - **Host**: `smtp.gmail.com`
  - **Port**: `465` (SSL) or `587` (STARTTLS)
  - **Username**: Your Gmail address
  - **Password**: A 16-character **Google App Password** (requires 2-Step Verification enabled on the Google account)
  - **Sender email**: Your Gmail address
  - **Sender name**: `LouDent Dental Clinic`

### Option C — Resend Free Tier (If You Own a Custom Domain)
- **Cost**: Free ($0/month)
- **Free Quota**: **100 emails/day** (3,000/month)
- **Requirement**: Requires a custom DNS domain (cannot send to arbitrary recipients from `onboarding@resend.dev`).
- **SMTP Settings**:
  - **Host**: `smtp.resend.com`
  - **Port**: `465`
  - **Username**: `resend`
  - **Password**: Your Resend API key (`re_...`)

---

## 3. Security Rules for SMTP Credentials

- Configure SMTP credentials **only** inside **Supabase Dashboard → Authentication → SMTP Settings**.
- Never place SMTP usernames, passwords, or API keys in `.env.local` or any `VITE_` frontend variable.
