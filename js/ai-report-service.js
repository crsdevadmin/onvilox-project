/**
 * Onvilox AI Report Service
 * Shared logic for Claude 4.5 Sonnet Clinical Reporting
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

        return {
            patient: {
                name: patient.name, age: patient.age, sex: patient.sex,
                weight: patient.weight, height: patient.height,
                usualWeight: patient.usualWeight,
                weightLossPercent: patient.weightLossPercent || 0,
                uhic: patient.uhic, cancer: patient.cancer,
                cancerStage: patient.cancerStage, regimen: patient.regimen,
                ecogStatus: patient.ecogStatus, treatmentTypes: patient.treatmentTypes,
                feedingMethod: patient.feedingMethod,
                reducedFoodIntake: patient.reducedFoodIntake || 0,
                albumin: patient.albumin, prealbumin: patient.prealbumin,
                crp: patient.crp, hemoglobin: patient.hemoglobin,
                bloodSugar: patient.bloodSugar, hba1c: patient.hba1c,
                sodium: patient.sodium, potassium: patient.potassium,
                magnesium: patient.magnesium, creatinine: patient.creatinine,
                alt: patient.alt, ast: patient.ast, bilirubin: patient.bilirubin,
                vitD: patient.vitD, vitB12: patient.vitB12,
                folate: patient.folate, zinc: patient.zinc,
                smi: patient.smi, handGrip: patient.handGrip,
                muac: patient.muac, lvef: patient.lvef || null,
                comorbidities: patient.comorbidities || [],
                allergies: patient.allergies || [],
                sideEffects: patient.sideEffects || [],
                culturalPreferences: patient.culturalPreferences,
                genomicMarkers: patient.genomicMarkers || [],
                tumorBurden: patient.tumorBurden,
                sarcopeniaStatus: patient.sarcopeniaStatus
            },
            plan: {
                bmi: bmi, dailyCalories: fp.dailyCalories, kcalPerKg: fp.kcalPerKg,
                dailyProtein: fp.dailyProtein, proteinPerKg: fp.proteinPerKg,
                prescribedRoute: fp.prescribedRoute, cachexia: fp.cachexia,
                proteinType: fp.proteinType, safetyAlerts: fp.safetyAlerts || [],
                interactions: fp.interactions || [],
                micronutrients: fp.micronutrients || {},
                outcomes: fp.outcomes || {},
                recipe: fp.recipe || {}
            }
        };
    },

    /**
     * Calls the Claude AI API to generate clinical insights.
     */
    generateInsights: async function(patient, plan) {
        const apiBase = (typeof CONFIG !== 'undefined' && CONFIG.API_BASE_URL) ? CONFIG.API_BASE_URL : 'http://localhost:3000';
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
