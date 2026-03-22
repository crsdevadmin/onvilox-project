let selectedCancer = "";

// ---------- INIT ----------
window.onload = function () {
  loadCancerDropdown();
  loadFeedingMethods();
  loadMultiSelect("comorbidityDropdown", comorbiditiesList, "comorbidityTags");
  loadMultiSelect("sideEffectDropdown", sideEffectsList, "sideEffectTags");
  loadMultiSelect("genomicMarkersDropdown", genomicMarkersList, "genomicMarkersTags");
  loadMultiSelect("treatmentDropdown", treatmentsList, "treatmentTags");
  loadMultiSelect("allergyDropdown", allergiesList, "allergyTags");
  loadMultiSelect("supplementDropdown", supplementsList, "supplementTags");
  loadMultiSelect("metastasisDropdown", metastaticSitesList, "metastasisTags");
};

// ---------- CANCER ----------
function loadCancerDropdown() {
  const dropdown = document.getElementById("cancerDropdown");
  dropdown.innerHTML = "";

  Object.keys(cancerRegimenMap).forEach(cancer => {
    const div = document.createElement("div");
    div.innerText = cancer;
    div.onclick = () => selectCancer(cancer);
    dropdown.appendChild(div);
  });
}

function openCancerDropdown() {
  document.getElementById("cancerDropdown").style.display = "block";
  filterCancerList();
}

function filterCancerList() {
  let input = document.getElementById("cancerInput").value.toLowerCase();
  // Handle common typos for better UX
  input = input.replace('cholung', 'cholang')
               .replace('colorectal', 'colon');
               
  const dropdown = document.getElementById("cancerDropdown");
  dropdown.innerHTML = "";

  Object.keys(cancerRegimenMap).forEach(cancer => {
    let matchString = cancer.toLowerCase();
    
    if (matchString.includes(input)) {
      const div = document.createElement("div");
      div.innerText = cancer;
      div.onclick = () => selectCancer(cancer);
      dropdown.appendChild(div);
    }
  });
}

function selectCancer(cancer) {
  selectedCancer = cancer;
  const input = document.getElementById("cancerInput");
  input.value = cancer;
  document.getElementById("cancerDropdown").style.display = "none";

  document.getElementById("regimenInput").value = "";
  loadRegimenDropdown();
  validateField(input, "Cancer Type");
}

// ---------- REGIMEN ----------
function openRegimenDropdown() {
  document.getElementById("regimenDropdown").style.display = "block";
  loadRegimenDropdown();
}

function loadRegimenDropdown() {
  const dropdown = document.getElementById("regimenDropdown");
  dropdown.innerHTML = "";

  if (!selectedCancer) return;

  cancerRegimenMap[selectedCancer].forEach(regimen => {
    const div = document.createElement("div");
    div.innerText = regimen;
    div.onclick = () => selectRegimen(regimen);
    dropdown.appendChild(div);
  });
}

function filterRegimenList() {
  const input = document.getElementById("regimenInput").value.toLowerCase();
  const dropdown = document.getElementById("regimenDropdown");
  dropdown.innerHTML = "";

  if (!selectedCancer) return;

  cancerRegimenMap[selectedCancer].forEach(regimen => {
    if (regimen.toLowerCase().includes(input)) {
      const div = document.createElement("div");
      div.innerText = regimen;
      div.onclick = () => selectRegimen(regimen);
      dropdown.appendChild(div);
    }
  });
}

function selectRegimen(regimen) {
  const input = document.getElementById("regimenInput");
  input.value = regimen;
  document.getElementById("regimenDropdown").style.display = "none";
  validateField(input, "Chemo Regimen");
}

// ---------- FEEDING ----------
function loadFeedingMethods() {
  const select = document.getElementById("feedingMethod");
  select.innerHTML = '<option value="">Select feeding method</option>';

  feedingMethods.forEach(method => {
    const option = document.createElement("option");
    option.text = method;
    select.add(option);
  });
}

// ---------- MULTI TAG ----------
function loadMultiSelect(dropdownId, dataList, tagContainerId) {
  const dropdown = document.getElementById(dropdownId);
  if (!dropdown) return; // Exit if ID is not on this page
  dropdown.innerHTML = "";

  dataList.forEach(item => {
    const div = document.createElement("div");
    div.innerText = item;
    div.onclick = () => addTag(item, tagContainerId);
    dropdown.appendChild(div);
  });
}

function filterMultiList(input, dropdownId) {
  const filter = input.value.toLowerCase();
  const dropdown = document.getElementById(dropdownId);
  dropdown.style.display = "block";
  dropdown.innerHTML = "";

  let list = [];
  if (dropdownId.includes("comorbidity")) list = comorbiditiesList;
  else if (dropdownId.includes("sideEffect")) list = sideEffectsList;
  else if (dropdownId.includes("genomic")) list = genomicMarkersList;
  else if (dropdownId.includes("treatment")) list = treatmentsList;
  else if (dropdownId.includes("allergy")) list = allergiesList;
  else if (dropdownId.includes("supplement")) list = supplementsList;
  else if (dropdownId.includes("metastasis")) list = metastaticSitesList;

  list.forEach(item => {
    if (item.toLowerCase().includes(filter)) {
      const div = document.createElement("div");
      div.innerText = item;
      div.onclick = () => addTag(item, dropdownId.replace("Dropdown","Tags"));
      dropdown.appendChild(div);
    }
  });
}

function handleTagInput(event, containerId) {
  if (event.key === 'Enter') {
    event.preventDefault();
    const text = event.target.value.trim();
    if (text) {
      addTag(text, containerId);
      event.target.value = '';
      
      // Also hide the dropdown
      const dropdownId = containerId.replace('Tags', 'Dropdown');
      const dropdown = document.getElementById(dropdownId);
      if(dropdown) dropdown.style.display = 'none';
    }
  }
}

function addTag(text, containerId) {
  const container = document.getElementById(containerId);
  if ([...container.children].some(tag => tag.dataset.value === text)) return;

  const tag = document.createElement("div");
  tag.className = "tag";
  tag.dataset.value = text;
  tag.innerHTML = `${text} <span onclick="removeTag(this)">×</span>`;
  container.appendChild(tag);
  
  // Hide dropdown and clear search input after selection
  const dropdownId = containerId.replace("Tags", "Dropdown");
  const dropdown = document.getElementById(dropdownId);
  if(dropdown) {
     dropdown.style.display = "none";
     const input = dropdown.previousElementSibling;
     if(input && input.tagName === 'INPUT') {
       input.value = "";
     }
  }
}

// Close dropdowns if clicking anywhere outside
document.addEventListener('click', function(e) {
  if (!e.target.closest('.dropdown-list') && !e.target.closest('input')) {
    document.querySelectorAll('.dropdown-list').forEach(dl => {
      dl.style.display = 'none';
    });
  }
});

function removeTag(el) {
  el.parentElement.remove();
}

// ---------- VALIDATION ----------
const CLINICAL_RANGES = {
  sodium: { min: 110, max: 160, label: "Sodium (Na+)", ref: "135-145 mEq/L" },
  potassium: { min: 2.0, max: 8.0, label: "Potassium (K+)", ref: "3.5-5.0 mmol/L" },
  hemoglobin: { min: 4, max: 20, label: "Hemoglobin (Hb)", ref: "12-16 g/dL" },
  creatinine: { min: 0.1, max: 15, label: "Creatinine", ref: "0.6-1.2 mg/dL" },
  bloodSugar: { min: 20, max: 1000, label: "Blood Sugar", ref: "70-140 mg/dL" },
  albumin: { min: 1.0, max: 6.0, label: "Albumin", ref: "3.5-5.0 g/dL" },
  weight: { min: 20, max: 300, label: "Weight" },
  height: { min: 50, max: 250, label: "Height" }
};

function validateField(field, fieldName) {
  const msgBox = document.getElementById(field.id + "_msg");
  if (!field) return true;

  const valRaw = (field.value ?? "");
  const val = (typeof valRaw === "string") ? valRaw.trim() : valRaw;
  const isMandatory = field.getAttribute('required') !== null;

  // Required check
  if (val === "" || val === null || val === undefined) {
    if (isMandatory) {
      field.classList.add("field-invalid");
      field.classList.remove("field-valid");
      if (msgBox) {
        msgBox.className = "validation-msg validation-error";
        msgBox.innerText = fieldName + " is required";
      }
      return false;
    } else {
      field.classList.remove("field-invalid", "field-valid");
      if (msgBox) {
        msgBox.className = "validation-msg validation-info";
        msgBox.innerText = "Not available";
      }
      return true;
    }
  }

  // Numeric checks
  if (field.type === "number" || field.getAttribute('data-type') === 'number') {
    const num = parseFloat(val);
    if (Number.isNaN(num)) {
      field.classList.add("field-invalid");
      if (msgBox) {
        msgBox.className = "validation-msg validation-error";
        msgBox.innerText = "Invalid entry";
      }
      return false;
    }

    // Check against CLINICAL_RANGES
    const range = CLINICAL_RANGES[field.id];
    if (range) {
      if (num < range.min || num > range.max) {
        field.classList.add("field-invalid");
        if (msgBox) {
          msgBox.className = "validation-msg validation-warning";
          msgBox.innerText = `Out of physiological range (${range.min}-${range.max})`;
        }
        // We return true but keep the warning class
        return true; 
      }
    }

    // Generic min/max attributes
    const minAttr = field.getAttribute("min");
    const maxAttr = field.getAttribute("max");
    if (minAttr !== null && num < parseFloat(minAttr)) {
      field.classList.add("field-invalid");
      if (msgBox) {
        msgBox.className = "validation-msg validation-error";
        msgBox.innerText = "Too low";
      }
      return false;
    }
  }

  field.classList.add("field-valid");
  field.classList.remove("field-invalid");
  if (msgBox) {
    msgBox.className = "validation-msg validation-success";
    msgBox.innerText = "✓ Valid";
  }
  return true;
}


