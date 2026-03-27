/**
 * Onvilox AI Report Service
 * Shared logic for Claude 3.5 Sonnet Clinical Reporting
 */

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

        // Safety alerts: send only condition + severity, not full message text
        const alertsSlim = (fp.safetyAlerts || [])
            .filter(a => a.level === 'danger' || a.level === 'warning')
            .map(a => ({ level: a.level, condition: (a.condition || a.message || '').substring(0, 60) }));

        return {
            patient: compactLabs({
                age: patient.age, sex: patient.sex,
                weight: patient.weight, height: patient.height,
                usualWeight: patient.usualWeight,
                weightLossPercent: patient.weightLossPercent || 0,
                cancer: patient.cancer, cancerStage: patient.cancerStage,
                regimen: patient.regimen, ecogStatus: patient.ecogStatus,
                feedingMethod: patient.feedingMethod,
                reducedFoodIntake: patient.reducedFoodIntake || 0,
                albumin: patient.albumin, prealbumin: patient.prealbumin,
                crp: patient.crp, hemoglobin: patient.hemoglobin,
                bloodSugar: patient.bloodSugar, hba1c: patient.hba1c,
                sodium: patient.sodium, potassium: patient.potassium,
                magnesium: patient.magnesium, creatinine: patient.creatinine,
                alt: patient.alt, ast: patient.ast, bilirubin: patient.bilirubin,
                vitD: patient.vitD, tsh: patient.tsh, zinc: patient.zinc,
                smi: patient.smi, handGrip: patient.handGrip,
                comorbidities: patient.comorbidities || [],
                sideEffects: patient.sideEffects || [],
                genomicMarkers: patient.genomicMarkers || [],
                tumorBurden: patient.tumorBurden,
                sarcopeniaStatus: patient.sarcopeniaStatus,
                vegetarian: patient.vegetarian,
                culturalPreferences: patient.culturalPreferences
            }, ['age','sex','weight','height','usualWeight','weightLossPercent','cancer','cancerStage','regimen','ecogStatus','feedingMethod','reducedFoodIntake','albumin','prealbumin','crp','hemoglobin','bloodSugar','hba1c','sodium','potassium','magnesium','creatinine','alt','ast','bilirubin','vitD','tsh','zinc','smi','handGrip','tumorBurden','sarcopeniaStatus','vegetarian','culturalPreferences','comorbidities','sideEffects','genomicMarkers']),
            plan: {
                bmi: bmi,
                dailyCalories: fp.dailyCalories, kcalPerKg: fp.kcalPerKg,
                dailyProtein: fp.dailyProtein, proteinPerKg: fp.proteinPerKg,
                servingsPerDay: fp.servingsPerDay,
                perServingCalories: fp.perServingCalories,
                perServingProtein: fp.perServingProtein,
                dailyCarbs: fp.dailyCarbs, dailyFat: fp.dailyFat,
                macroCarbs: fp.macroCarbs, macroFat: fp.macroFat,
                prescribedRoute: fp.prescribedRoute,
                cachexia: fp.cachexia, sarcopenia: fp.sarcopenia,
                proteinType: fp.proteinType,
                safetyFlags: alertsSlim,
                drugInteractions: (fp.interactions || []).map(i => ({ drug: i.drug, effect: i.effect })),
                micronutrientsActive: microSlim,
                feasibilityScore: fp.feasibilityScore,
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

        try {
            const response = await fetch(`${apiBase}/api/claude-report`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'X-Claude-Context': 'PatientReport'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.details || errData.error || 'AI request failed');
            }

            const data = await response.json();
            console.log("AI Auditor Response Received:", data);
            return data;
        } catch (error) {
            console.error("AI Insight Generation Failed:", error);
            throw error;
        }
    }
};
