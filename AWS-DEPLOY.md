# AWS Deployment Guide — Onvilox Backend

## Overview
- **Backend**: Node.js/Express → AWS Elastic Beanstalk
- **Database**: PostgreSQL → AWS RDS
- **Frontend**: Static HTML/JS files (serve from S3 or any static host)

---

## Step 1 — Create AWS RDS PostgreSQL Database

1. Go to **AWS Console → RDS → Create database**
2. Choose **PostgreSQL**, Free Tier eligible
3. Settings:
   - DB instance identifier: `onvilox-db`
   - Master username: `onvilox_user`
   - Master password: (choose a strong password)
4. Connectivity: **Public access = Yes** (or use VPC with EB in same VPC)
5. After creation, note the **Endpoint** (e.g. `onvilox-db.xxxx.us-east-1.rds.amazonaws.com`)
6. In RDS Security Group, allow inbound **port 5432** from your EB environment's security group

### Run Schema
Connect to your RDS instance and run both SQL files:
```bash
psql -h <rds-endpoint> -U onvilox_user -d onvilox_db -f server/schema.sql
psql -h <rds-endpoint> -U onvilox_user -d onvilox_db -f server/schema-migration.sql
```

---

## Step 2 — Deploy Backend to AWS Elastic Beanstalk

### Prerequisites
```bash
pip install awsebcli
aws configure   # enter your AWS Access Key ID + Secret
```

### Deploy
```bash
cd server
eb init onvilox-api --platform "Node.js 20" --region us-east-1
eb create onvilox-production
```

### Set Environment Variables
In EB Console → Environment → Configuration → Software → Environment properties:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `PORT` | `8080` |
| `DATABASE_URL` | `postgres://onvilox_user:PASSWORD@<rds-endpoint>:5432/onvilox_db?sslmode=require` |
| `JWT_SECRET` | (generate a strong random string) |
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` |

Or via CLI:
```bash
eb setenv NODE_ENV=production DATABASE_URL=postgres://... JWT_SECRET=... ANTHROPIC_API_KEY=sk-ant-...
```

### Get Your Endpoint
After `eb create` completes, your URL will be shown:
```
Application available at: onvilox-production.us-east-1.elasticbeanstalk.com
```

---

## Step 3 — Update Frontend Config

Edit `js/config.js` and set your EB URL:
```javascript
const CONFIG = {
  API_BASE_URL: "https://onvilox-production.us-east-1.elasticbeanstalk.com"
};
```

---

## Step 4 — Serve Frontend Files

Option A — **S3 Static Website** (recommended):
1. Create an S3 bucket, enable static website hosting
2. Upload all HTML/JS/CSS/assets files
3. Set bucket policy for public read
4. Access via the S3 website URL or add CloudFront CDN

Option B — **Serve from EB itself**:
Add a route in `server/index.js` to serve static files:
```javascript
app.use(express.static(path.join(__dirname, '../')));
```
Then copy all frontend files into the server directory before deploying.

---

## Step 5 — Create First Admin User

After deploying, create the first user via API:
```bash
curl -X POST https://your-eb-url.com/api/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-jwt>" \
  -d '{"name":"Admin","email":"admin@onvilox.com","password":"secure123","role":"ADMIN"}'
```

Or directly in RDS:
```sql
INSERT INTO users (id, name, email, password_hash, role)
VALUES ('admin_1', 'Admin', 'admin@onvilox.com', '<bcrypt_hash>', 'ADMIN');
```

---

## What Changed vs ngrok

| Before | After |
|--------|-------|
| `server/index.js` running locally | Deployed to AWS Elastic Beanstalk |
| ngrok tunnel URL in `js/config.js` | AWS EB URL in `js/config.js` |
| Patient/plan data in localStorage | Stored in AWS RDS PostgreSQL |
| Login from localStorage users | Login from RDS users table |
| Data lost on browser clear | Data persists in DB forever |

## Troubleshooting

- **CORS errors**: The server has `app.use(cors())` — if needed, restrict to your frontend domain
- **502 Bad Gateway**: Check EB logs (`eb logs`) — usually a missing env var or DB connection issue
- **DB connection refused**: Check RDS security group allows inbound 5432 from EB
- **Missing data after migration**: Run the schema migration SQL, then users need to re-register
