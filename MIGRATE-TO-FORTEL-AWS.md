# Move GQUENCE (Onvilox) to the Fortel AWS account

Old account: **onvilox (804136008775)** · app `onvilox-api` / env `onvilox-production` · DB `onvilox-db` (PostgreSQL, db `onvilox_db`) · region **us-east-1 (N. Virginia)**
New account: **Fortel** · recommended region **ap-south-1 (Mumbai)**, closer to users
Domain: **gquence.in** (behind Cloudflare)

> Nothing in Part C can run until `onvilox-db` is **Available** again (AWS Support must unlock it).
> Parts A–B can be done now.

Fill these in as you go (keep this list private, never commit passwords):

| Item | Value |
|---|---|
| OLD_DB_HOST | onvilox-db.cuv2yag4i74x.us-east-1.rds.amazonaws.com |
| OLD_DB_USER / DB | (from old DATABASE_URL) / onvilox_db |
| Old Postgres version | (RDS → onvilox-db → Configuration → Engine version) |
| NEW_DB_HOST | (Part B2) |
| NEW_DB_USER / password | (Part B2) |
| NEW_EB_CNAME | (Part D) |

---

## Part A — Prepare (now)

**A1. Save the old app's environment variables.**
Old account → Elastic Beanstalk → `onvilox-production` → Configuration → *Updates, monitoring and logging* → **Environment properties**. Copy every value into a password manager (not chat, not git):

`DATABASE_URL, JWT_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY, OPENAI_STT_MODEL, GCP_WIF_CONFIG, SUPER_ADMIN_PASSWORD, PG_POOL_MAX` (some may be empty).

- `VAPID_*` **must** stay identical — the public key is built into `js/pwa.js`; changing it breaks push on every device.
- `JWT_SECRET` same → nobody is logged out.

If the console won't open the environment yet, they are also on your Mac in `server/.env` (local copy — check it matches).

**A2. CLI access to the Fortel account.**
Fortel console → IAM → Users → *Create user* `gquence-deployer` → attach **AdministratorAccess** (narrow later) → Security credentials → *Create access key* (CLI). Then on your Mac:

```bash
aws configure --profile fortel        # key, secret, region ap-south-1, json
aws sts get-caller-identity --profile fortel   # must show the Fortel account number
```

**A3. Postgres client on the Mac** (major version must be ≥ the old DB's version):

```bash
brew install postgresql@16      # use @15/@17 to match the engine version
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
pg_dump --version
```

---

## Part B — Build the new database (now)

**B1.** Fortel console → region **Asia Pacific (Mumbai)** → RDS → *Create database* → **Standard create**:
- Engine **PostgreSQL**, same major version as the old one
- Template **Free tier / Dev-Test**, **Single-AZ**
- Identifier `gquence-db`, master user `gquence_admin`, strong password (save it)
- Class **db.t4g.micro**, storage **20 GB gp3**, *storage autoscaling* on (max 100)
- Connectivity: default VPC, **Public access: Yes** *(temporary, for the data load — turned off in Part E)*, new security group `gquence-db-sg`
- Additional configuration → *Initial database name* **onvilox_db**
- Backups **7 days**, encryption on (default key is fine)

**B2.** When Available: note the **Endpoint** = NEW_DB_HOST.
Security group `gquence-db-sg` → Inbound → add **PostgreSQL 5432, Source = My IP**.

Test from the Mac:
```bash
psql "host=NEW_DB_HOST port=5432 dbname=onvilox_db user=gquence_admin sslmode=require" -c "select version();"
```

---

## Part C — Copy the data (only after AWS unlocks onvilox-db)

**C1.** Old account → RDS (N. Virginia) → `onvilox-db` → *Actions → Take snapshot* → `onvilox-db-final-before-move`. Wait until *Available*.

**C2. Open the old DB to your Mac, briefly.** `onvilox-db` → *Modify* → Connectivity → **Publicly accessible: Yes** → *Apply immediately*. Its security group → Inbound → **PostgreSQL 5432 from My IP**.

**C3. Stop writes** — tell users the app is down for ~30 min (so nothing is entered after the dump).

**C4. Dump** (custom format, no owners):
```bash
cd ~/Desktop
pg_dump "host=OLD_DB_HOST port=5432 dbname=onvilox_db user=OLD_DB_USER sslmode=require" \
  -Fc --no-owner --no-acl -f onvilox_$(date +%Y%m%d_%H%M).dump
ls -lh onvilox_*.dump
```
Copy the `.dump` file to Google Drive too — this is your off-AWS backup from now on.

**C5. Restore into the new DB:**
```bash
pg_restore -d "host=NEW_DB_HOST port=5432 dbname=onvilox_db user=gquence_admin sslmode=require" \
  --no-owner --no-acl --role=gquence_admin -j 4 onvilox_YYYYMMDD_HHMM.dump
```
A few "already exists" notices are harmless; anything mentioning a missing table is not — stop and send me the output.

**C6. Check the counts match** (run on both hosts, numbers must be equal):
```bash
for H in OLD_DB_HOST NEW_DB_HOST; do echo "== $H"; psql "host=$H dbname=onvilox_db user=<user> sslmode=require" -Atc \
"select 'patients',count(*) from patients union all select 'monitoring_logs',count(*) from monitoring_logs
 union all select 'weekly_prescriptions',count(*) from weekly_prescriptions union all select 'manufacturing_jobs',count(*) from manufacturing_jobs
 union all select 'users',count(*) from users"; done
```

---

## Part D — Deploy the app to Fortel

From the **project root** (never `server/`):

```bash
cd "/Users/mohammedjaffersharief/My Projects/Fortel/onvilox-corrected-pdf-qr-pdf-fixed"
cp .elasticbeanstalk/config.yml .elasticbeanstalk/config.onvilox-OLD.yml   # keep the old settings
eb init gquence --platform "Node.js 20" --region ap-south-1 --profile fortel
eb create gquence-production --profile fortel --instance_type t3.micro --elb-type application
```

Set the environment variables (one line; values from A1, new DATABASE_URL):
```bash
eb setenv --profile fortel NODE_ENV=production PORT=8080 \
  DATABASE_URL="postgres://gquence_admin:PASSWORD@NEW_DB_HOST:5432/onvilox_db?sslmode=require" \
  JWT_SECRET="..." VAPID_PUBLIC_KEY="..." VAPID_PRIVATE_KEY="..." \
  ANTHROPIC_API_KEY="..." OPENAI_API_KEY="..." OPENAI_STT_MODEL="..." GCP_WIF_CONFIG='...' SUPER_ADMIN_PASSWORD="..."
eb health --profile fortel        # wait for Green
eb status --profile fortel        # note the CNAME = NEW_EB_CNAME
```

Let the app reach the DB: RDS `gquence-db-sg` → Inbound → **PostgreSQL 5432, Source = the EB instances' security group** (EC2 → Security groups → the one named `…gquence-production…AWSEBSecurityGroup…`).

**Test before switching DNS:** open `http://NEW_EB_CNAME/login`, log in, open Balasubramanian, check prescriptions and the store dashboard.

---

## Part E — Switch over

1. **Cloudflare → gquence.in → DNS**: change the record that points to the old `…elasticbeanstalk.com` / load balancer to **NEW_EB_CNAME** (CNAME, proxied/orange cloud as before). Keep SSL/TLS mode as it was.
   - If SSL mode is **Full (strict)**, the new load balancer needs a certificate: Fortel → ACM (Mumbai) → request `gquence.in` + `*.gquence.in`, validate via Cloudflare DNS, then EB → Configuration → Load balancer → add **HTTPS 443** listener with it.
2. Open https://gquence.in on a browser and the tablet (close/reopen the app). Log in, test one full flow.
3. **Lock the new DB down:** `gquence-db` → Modify → **Publicly accessible: No**; remove the *My IP* rule from `gquence-db-sg`.
4. **SMS**: re-register the sender ID / templates in the Fortel account (End User Messaging) if the app sends SMS.
5. Future deploys: `eb deploy --profile fortel` from the project root.

---

## Part F — Close the old account (after 1–2 weeks of normal running)

1. Final snapshot already taken (C1) + the `.dump` on Google Drive.
2. Old account: terminate EB env `onvilox-production`, delete `onvilox-db` (keep final snapshot), release unused Elastic IPs.
3. **fortel-crm-db (Mumbai) also lives in the old account** — move it the same way (Parts B–C, db `fortelcrm`) before closing anything.
4. Delete the old IAM access keys.

---

## Rollback
Until Part F, the old setup is untouched. If anything breaks after the DNS switch, point Cloudflare back to the old EB address.
