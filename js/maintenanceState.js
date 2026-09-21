// Read the build-time default once
const initial = import.meta.env.VITE_MAINTENANCE_MODE === "true";

export const maintenanceState = {
  isOn: initial,
};

export function setMaintenance(value) {
  value = value === true || value === "true";
  maintenanceState.isOn = value === true || value === "true";
  import.meta.env.VITE_MAINTENANCE_MODE = String(value);
}

export function getMaintenance() {
  return maintenanceState.isOn; // boolean now
}