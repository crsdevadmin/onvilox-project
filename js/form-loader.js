let selectedCancer = "";

// ---------- INIT ----------
window.onload = function () {
  loadCancerDropdown();
  loadFeedingMethods();
  loadMultiSelect("comorbidityDropdown", comorbiditiesList, "comorbidityTags");
  loadMultiSelect("sideEffectDropdown", sideEffectsList, "sideEffectTags");
};

// ---------- CANCER ----------
function loadCancerDropdown() {
  const dropdown = document.getElementById("cancerDropdown");

  dropdown.style.display = "block";
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
  const input = document.getElementById("cancerInput").value.toLowerCase();
  const dropdown = document.getElementById("cancerDropdown");
  dropdown.innerHTML = "";

  Object.keys(cancerRegimenMap).forEach(cancer => {
    if (cancer.toLowerCase().includes(input)) {
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

  dropdown.style.display = "block";
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

  const list = dropdownId.includes("comorbidity") ? comorbiditiesList : sideEffectsList;

  list.forEach(item => {
    if (item.toLowerCase().includes(filter)) {
      const div = document.createElement("div");
      div.innerText = item;
      div.onclick = () => addTag(item, dropdownId.replace("Dropdown","Tags"));
      dropdown.appendChild(div);
    }
  });
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
function validateField(field, fieldName) {
  const msgBox = document.getElementById(field.id + "_msg");

  const valRaw = (field.value ?? "");
  const val = (typeof valRaw === "string") ? valRaw.trim() : valRaw;

  // Required check
  if (val === "" || val === null || val === undefined) {
    field.classList.add("field-invalid");
    field.classList.remove("field-valid");
    if (msgBox) {
      msgBox.className = "validation-msg validation-error";
      msgBox.innerText = fieldName + " is required";
    }
    return false;
  }

  // Special: Cancer must be from master list
  if (field.id === "cancerInput") {
    const ok = Object.prototype.hasOwnProperty.call(cancerRegimenMap, val);
    if (!ok) {
      field.classList.add("field-invalid");
      field.classList.remove("field-valid");
      if (msgBox) {
        msgBox.className = "validation-msg validation-error";
        msgBox.innerText = "Please select a valid Cancer Type from the list";
      }
      return false;
    }
  }

  // Special: Regimen must be valid for selected cancer
  if (field.id === "regimenInput") {
    const cancer = (selectedCancer || (document.getElementById("cancerInput")?.value || "")).trim();
    const regimens = cancerRegimenMap[cancer] || [];
    const ok = regimens.includes(val);
    if (!ok) {
      field.classList.add("field-invalid");
      field.classList.remove("field-valid");
      if (msgBox) {
        msgBox.className = "validation-msg validation-error";
        msgBox.innerText = "Please select a valid Regimen for the chosen cancer type";
      }
      return false;
    }
  }

  // Numeric checks (respect min/max where provided)
  if (field.type === "number") {
    const num = parseFloat(val);
    if (Number.isNaN(num)) {
      field.classList.add("field-invalid");
      field.classList.remove("field-valid");
      if (msgBox) {
        msgBox.className = "validation-msg validation-error";
        msgBox.innerText = fieldName + " must be a number";
      }
      return false;
    }
    const minAttr = field.getAttribute("min");
    const maxAttr = field.getAttribute("max");
    if (minAttr !== null && num < parseFloat(minAttr)) {
      field.classList.add("field-invalid");
      field.classList.remove("field-valid");
      if (msgBox) {
        msgBox.className = "validation-msg validation-error";
        msgBox.innerText = fieldName + " must be ≥ " + minAttr;
      }
      return false;
    }
    if (maxAttr !== null && num > parseFloat(maxAttr)) {
      field.classList.add("field-invalid");
      field.classList.remove("field-valid");
      if (msgBox) {
        msgBox.className = "validation-msg validation-error";
        msgBox.innerText = fieldName + " must be ≤ " + maxAttr;
      }
      return false;
    }
  }

  field.classList.add("field-valid");
  field.classList.remove("field-invalid");
  if (msgBox) {
    msgBox.className = "validation-msg validation-success";
    msgBox.innerText = "✓ Looks good";
  }
  return true;
}


