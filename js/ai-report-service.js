/**
 * AI Report Service — shared logic for Claude clinical reporting
 */

// Normalise common regimen misspellings and shorthand to canonical clinical names.
// Used for both display and the AI payload so Claude receives correct drug names.
function normalizeRegimen(regimen) {
    if (!regimen) return regimen;
    return regimen
        .replace(/\bcepatin\b/gi, 'Cisplatin')
        .replace(/\bcarbopaltin\b/gi, 'Carboplatin')
        .replace(/\bpaclitaxol\b/gi, 'Paclitaxel')
        .replace(/\bdocetaxol\b/gi, 'Docetaxel')
        .replace(/\bgemcis\b/gi, 'Gemcitabine + Cisplatin')
        .replace(/\bgem-cis\b/gi, 'Gemcitabine + Cisplatin')
        .replace(/\bpembro\b/gi, 'Pembrolizumab')
        .replace(/\bnivo\b/gi, 'Nivolumab')
        .replace(/\batez\b/gi, 'Atezolizumab');
}

const aiReportService = {
    /**
     * Prepares the payload for the Claude AI report based on patient and plan data.
     */
    preparePayload: function(patient, plan) {
        const fp = plan.finalPlan || plan;
        const bmi = fp.bmi != null ? fp.bmi : (function () {
            const h = parseFloat(patient.height) / 100;
            return Math.round((parseFloat(patient.weight) / (h * h)) * 10) / 10;
        })();

        // Only send non-null lab values to reduce token count
        function compactLabs(src, keys) {
            const out = {};
            keys.forEach(k => { if (src[k] != null && src[k] !== 0 && src[k] !== '') out[k] = src[k]; });
            return out;
        }

        // Slim micronutrients: only send keys that are non-standard (i.e. have a clinical decision)
        const microSlim = {};
        const mu = fp.micronutrients || {};
        Object.keys(mu).forEach(k => {
            const v = mu[k];
            if (v && v !== 'Standard' && v !== 'None' && v !== null) microSlim[k] = v;
        });

        // Safety alerts: send condition + full message (not truncated) so Claude has full engine context
        const alertsSlim = (fp.safetyAlerts || [])
            .filter(a => a.level === 'danger' || a.level === 'warning')
            .map(a => ({ level: a.level, condition: a.condition || a.message || '' }));

        return {
            patient: compactLabs({
                age: patient.age, sex: patient.sex,
                weight: patient.weight,
                weightLossPercent: patient.weightLossPercent || 0,
                cancer: patient.cancer, cancerStage: patient.cancerStage,
                regimen: normalizeRegimen(patient.regimen),
                feedingMethod: patient.feedingMethod,
                reducedFoodIntake: patient.reducedFoodIntake || 0,
                albumin: patient.albumin,
                crp: patient.crp, hemoglobin: patient.hemoglobin,
                bloodSugar: patient.bloodSugar, hba1c: patient.hba1c,
                folate: patient.folate,
                potassium: patient.potassium,
                magnesium: patient.magnesium, creatinine: patient.creatinine,
                alt: patient.alt, ast: patient.ast, bilirubin: patient.bilirubin,
                vitD: patient.vitD, tsh: patient.tsh, zinc: patient.zinc,
                comorbidities: patient.comorbidities || [],
                sideEffects: patient.sideEffects || [],
                tumorBurden: patient.tumorBurden,
                treatmentTypes: patient.treatmentTypes || []
            }, ['age','sex','weight','weightLossPercent','cancer','cancerStage','regimen','feedingMethod','reducedFoodIntake','albumin','crp','hemoglobin','bloodSugar','hba1c','folate','potassium','magnesium','creatinine','alt','ast','bilirubin','vitD','tsh','zinc','tumorBurden','comorbidities','sideEffects','treatmentTypes']),
            plan: {
                // calcWeight = IBW or actual weight the engine used — required for all rule validations
                calcWeight: fp.calcWeight || fp.ibw || parseFloat(patient.weight || 0),
                totalDailyCalories: fp.totalDailyCalories || fp.baseEnergy || fp.dailyCalories,
                onsCalories: fp.onsCalories || fp.dailyCalories,
                totalDailyProtein: fp.totalDailyProtein || fp.dailyProtein,
                prescribedProtein: fp.prescribedProtein,
                estimatedDietaryProtein: fp.estimatedDietaryProtein || 0,
                kcalPerKg: fp.kcalPerKg,
                dailyProtein: fp.dailyProtein, proteinPerKg: fp.proteinPerKg,
                servingsPerDay: fp.servingsPerDay,
                perServingCalories: fp.perServingCalories,
                dailyCarbs: fp.dailyCarbs, dailyFat: fp.dailyFat,
                cachexia: fp.cachexia, sarcopenia: fp.sarcopenia,
                proteinType: fp.proteinType,
                safetyFlags: alertsSlim,
                drugInteractions: (fp.interactions || []).map(i => ({ drug: i.drug, effect: i.effect })),
                micronutrientsActive: microSlim,
                mandatoryInvestigations: fp.mandatoryInvestigations || []
            }
        };
    },

    /**
     * Calls the Claude AI API to generate clinical insights.
     */
    generateInsights: async function(patient, plan) {
        const apiBase = (typeof CONFIG !== 'undefined' && CONFIG.API_BASE_URL) ? CONFIG.API_BASE_URL : '';
        const payload = this.preparePayload(patient, plan);

        const submitJob = async () => {
            const submitRes = await fetch(`${apiBase}/api/claude-report`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json; charset=utf-8' },
                body: JSON.stringify(payload)
            });
            if (!submitRes.ok) {
                const errData = await submitRes.json().catch(() => ({}));
                throw new Error(errData.error || 'AI request failed');
            }
            const { jobId } = await submitRes.json();
            if (!jobId) throw new Error('No jobId returned');
            return jobId;
        };

        let jobId = await submitJob();
        let resubmitted = false;

        // Poll until done — max 6 minutes, every 5 seconds
        const maxAttempts = 72;
        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(r => setTimeout(r, 5000));
            let pollRes;
            try {
                pollRes = await fetch(`${apiBase}/api/claude-report/status/${jobId}`);
            } catch(e) {
                continue; // network blip — retry
            }
            if (pollRes.status === 502 || pollRes.status === 503) {
                // Server restarting — wait a bit longer and retry
                await new Promise(r => setTimeout(r, 6000));
                continue;
            }
            if (pollRes.status === 404 && !resubmitted) {
                // Job lost (server restarted) — resubmit once
                console.warn('AI job lost — resubmitting...');
                jobId = await submitJob();
                resubmitted = true;
                continue;
            }
            if (!pollRes.ok) continue;
            const job = await pollRes.json();
            if (job.status === 'done') {
                console.log("AI Auditor Response Received:", job.data);
                return job.data;
            }
            if (job.status === 'error') throw new Error(job.error || 'AI job failed');
        }
        throw new Error('AI report timed out after 6 minutes — please try again.');
    }
};
