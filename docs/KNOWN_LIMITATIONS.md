# LouDent — Free-Tier Restrictions & Known Limitations

## 1. Free-Tier Quotas & Restrictions

| Service | Plan | Key Free-Tier Quotas & Restrictions |
|---|---|---|
| **Supabase Database & Auth** | Free Plan ($0) | • 500 MB PostgreSQL database size<br>• 50,000 monthly active users (MAUs)<br>• 1 GB Supabase Storage<br>• **Inactivity Pause**: Free Supabase projects pause after **7 days of inactivity** and must be unpaused from the Supabase Dashboard before a demo.<br>• **Built-in Auth Email Limit**: 2–4 emails/hour unless a free custom SMTP provider (such as Brevo Free: 300 emails/day) is configured. |
| **Vercel Hosting** | Hobby Plan ($0) | • Personal, academic, and non-commercial use only.<br>• 100 GB bandwidth / month.<br>• Commercial clinic operation requires upgrading to Vercel Pro or hosting the static `dist/` folder on a commercial static host. |
| **Custom SMTP (Optional)** | Brevo Free / Gmail | • Brevo Free allows 300 emails/day at $0.<br>• Resend Free allows 100 emails/day (3,000/month) if you own a custom DNS domain. |

---

## 2. Features That May Require Paid Services in Future Clinic Operations

1. **Always-On Database (No 7-Day Pause) & Automated Point-in-Time Recovery (PITR)**:
   - Requires Supabase Pro ($25/month) if used for daily live clinic operations.
2. **SMS Appointment Reminders**:
   - Not enabled (would require a paid usage-based SMS gateway such as Semaphore PH or Twilio).
3. **Commercial Hosting License**:
   - Vercel Hobby is restricted to non-commercial use (suitable for this university project and demonstration).
4. **High-Volume Transactional Email & Custom Domain DKIM/SPF**:
   - For high-volume clinic notifications beyond free SMTP daily caps, a paid transactional email plan + custom domain is recommended.

---

## 3. Known Limitations & Pending Live Steps

1. **Live Supabase Database Untouched Until Explicit Authorization**:
   - In accordance with the project safety rules, the 5 SQL migrations in `supabase/migrations/` have been verified in an isolated local PostgreSQL 17.5 instance (`npm run test:db`), and have **not** yet been pushed to `https://qlsfeqofszmtdkdedkqz.supabase.co`.
2. **Publishable Key Required in `.env.local`**:
   - Paste your project's `VITE_SUPABASE_PUBLISHABLE_KEY` into `.env.local` (copied from `.env.example`) to connect the local browser UI to your Supabase project.
3. **Appointment Notification Emails**:
   - Supabase Auth sends sign-up verification, password reset, and staff invitation emails. Transactional emails on appointment status changes (Confirm/Decline) are not sent automatically on the free tier to avoid exhausting the free SMTP quota; status updates appear in the patient's dashboard (auto-polled every 20 seconds and on tab focus) and in `appointment_history`.
4. **Fixed Hourly Start Slots**:
   - Preserves the approved LouDent slot model (`9:00 AM`, `10:00 AM`, `11:00 AM`, `1:00 PM`, `2:00 PM`, `3:00 PM`, `4:00 PM` in `Asia/Manila` time) while accounting for each service's full `duration_minutes` (30–90 min) for overlap and break-window checks.
