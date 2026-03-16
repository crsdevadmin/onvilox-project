const text = "weight : 88";
const numPattern = '(?:is|at|was|of|recorded at)?\\s*:?\\s*(\\d+\\.?\\d*)';
const regex = new RegExp('weight' + numPattern);
console.log("Weight test:", text.match(regex));
