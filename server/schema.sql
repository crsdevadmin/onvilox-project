-- Database Schema for Onvilox Assessment App

-- 1. Users table (Doctors, Assistants, Stores)
CREATE TABLE users (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL, -- DOCTOR, ASSISTANT, STORE, ADMIN
    hospital_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Patients table
CREATE TABLE patients (
    id VARCHAR(50) PRIMARY KEY,
    uhic VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    age INTEGER,
    sex VARCHAR(20),
    height DOUBLE PRECISION,
    weight DOUBLE PRECISION,
    usual_weight DOUBLE PRECISION,
    albumin DOUBLE PRECISION,
    crp DOUBLE PRECISION,
    muac DOUBLE PRECISION,
    creatinine DOUBLE PRECISION,
    egfr DOUBLE PRECISION,
    alt DOUBLE PRECISION,
    ast DOUBLE PRECISION,
    bilirubin DOUBLE PRECISION,
    blood_sugar DOUBLE PRECISION,
    tsh DOUBLE PRECISION,
    hemoglobin DOUBLE PRECISION,
    prealbumin DOUBLE PRECISION,
    vit_d DOUBLE PRECISION,
    vit_b12 DOUBLE PRECISION,
    folate DOUBLE PRECISION,
    zinc DOUBLE PRECISION,
    magnesium DOUBLE PRECISION,
    ecog_status INTEGER,
    cancer_stage VARCHAR(50),
    tumor_burden VARCHAR(50),
    metastasis_sites TEXT,
    treatment_types TEXT, -- Stores JSON string of treatments (Radiotherapy, etc.)
    palliative_stage VARCHAR(50),
    activity_level VARCHAR(50), -- Bedridden, Ambulatory
    bsa DOUBLE PRECISION,
    lean_body_mass DOUBLE PRECISION,
    sarcopenia_status VARCHAR(50),
    fat_percent DOUBLE PRECISION,
    is_vegetarian BOOLEAN DEFAULT FALSE,
    cultural_preferences TEXT,
    existing_supplements TEXT,
    feeding_method VARCHAR(255),
    gi_issues BOOLEAN DEFAULT FALSE,
    assigned_doctor_id VARCHAR(50) REFERENCES users(id),
    created_by_id VARCHAR(50) REFERENCES users(id),
    store_id VARCHAR(50), -- Can reference a stores table later
    status VARCHAR(50) DEFAULT 'CREATED',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Assessments (Follow-up Tracking)
CREATE TABLE assessments (
    id VARCHAR(50) PRIMARY KEY,
    patient_id VARCHAR(50) REFERENCES patients(id) ON DELETE CASCADE,
    assessment_date DATE NOT NULL,
    weight DOUBLE PRECISION,
    albumin DOUBLE PRECISION,
    crp DOUBLE PRECISION,
    muac DOUBLE PRECISION,
    creatinine DOUBLE PRECISION,
    alt DOUBLE PRECISION,
    ast DOUBLE PRECISION,
    bilirubin DOUBLE PRECISION,
    blood_sugar DOUBLE PRECISION,
    tsh DOUBLE PRECISION,
    hemoglobin DOUBLE PRECISION,
    prealbumin DOUBLE PRECISION,
    vit_d DOUBLE PRECISION,
    vit_b12 DOUBLE PRECISION,
    folate DOUBLE PRECISION,
    zinc DOUBLE PRECISION,
    magnesium DOUBLE PRECISION,
    bsa DOUBLE PRECISION,
    lean_body_mass DOUBLE PRECISION,
    fat_percent DOUBLE PRECISION,
    gi_issues BOOLEAN,
    reduced_food_intake DOUBLE PRECISION,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Nutrition Plans (Versioning)
CREATE TABLE nutrition_plans (
    id VARCHAR(50) PRIMARY KEY,
    patient_id VARCHAR(50) REFERENCES patients(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    inputs_snapshot JSONB, -- Stores vitals used for this version
    engine_output JSONB,   -- Stores raw engine calculations
    overrides JSONB,       -- Stores doctor overrides
    final_plan JSONB,      -- The resulting recipe/spec
    rationale TEXT[],      -- Array of clinical reasons
    override_notes TEXT,
    generated_by VARCHAR(100), -- ENGINE, DOCTOR_OVERRIDE
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
