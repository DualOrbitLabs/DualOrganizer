import {getMaintenance, setMaintenance, } from "./maintenanceState.js";

class CountdownClock {
  constructor(startTimestamp, isoDuration, elementId) {
    this.element = document.getElementById(elementId);

    // 1. Convert the starting timestamp to milliseconds
    const startMs = new Date(startTimestamp).getTime();

    // 2. Parse the ISO duration into milliseconds
    const durationMs = this.parseISODuration(isoDuration);

    // 3. Calculate the absolute end time
    this.endTime = startMs + durationMs;

    this.timerId = null;
  }

  // A simple parser for standard ISO 8601 durations (e.g., "PT3H30M")
  parseISODuration(isoString) {
    const regex = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
    const matches = isoString.match(regex);
    if (!matches) return 0;

    const [_, days, hours, minutes, seconds] = matches.map((num) =>
      parseInt(num || 0, 10)
    );

    return (
      (days * 24 * 60 * 60 * 1000) +
      (hours * 60 * 60 * 1000) +
      (minutes * 60 * 1000) +
      (seconds * 1000)
    );
  }

  start() {
    // Run immediately so there is no 1-second delay on load
    if(getMaintenance()){
      this.update();
      this.timerId = setInterval(() => this.update(), 1000);
    }
  }

  update() {
    const now = Date.now();
    const timeRemaining = this.endTime - now;

    // If the clock hits zero, stop the interval
    if (timeRemaining <= 0) {
      clearInterval(this.timerId);
      if(this.element) this.element.textContent = "00:00:00 - Time's up!";
      setMaintenance(false);
      console.log("clock2: ", getMaintenance());
      return;
    }

    // Convert milliseconds back into display units
    const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
    const minutes = Math.floor(
      (timeRemaining % (1000 * 60 * 60)) / (1000 * 60),
    );
    const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);

    // Format with leading zeros (e.g., 03:05:09)
    this.element.textContent = [hours, minutes, seconds]
      .map((unit) => String(unit).padStart(2, "0"))
      .join(":");
  }
}

addEventListener("DOMContentLoaded", (event) => {
  const rawStart = getMaintenance();
  const rawDuration = import.meta.env.VITE_ESTIMATED_TIME;
  console.log("clock1: ", rawStart)

  const myClock = new CountdownClock(rawStart, rawDuration, "clock");
  myClock.start();
});
