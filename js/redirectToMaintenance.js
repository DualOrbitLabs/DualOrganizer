import { getMaintenance } from "./maintenanceState.js";
import { getAuthenticatedUser } from "./supabaseClient.js";

const intervalId = setInterval(async () => {
  const isOnMaintenance = getMaintenance();
  console.log("interval: ", getMaintenance());
  console.log("clock3: ", getMaintenance())
  const rawWhiteList = import.meta.env.VITE_WHITELIST;
  const whiteListArray = rawWhiteList.split(",");
  const user = await getAuthenticatedUser();
  let isOnWhiteList = false;
  if (user.id != undefined) {
    for (let value in whiteListArray) {
      if (user.id === whiteListArray[value]) {
        //isOnWhiteList = true;
        break;
      }
    }
  } else {
    alert("You're not logged on, redirecting you to login!");
    globalThis.location.href = "/login.html";
    return;
  }
  /*if (isOnMaintenance === true) {
    if (
      globalThis.location.pathname === "/maintenance.html" && isOnWhiteList
    ) {
      globalThis.location.href = "/hub.html";
    }
    if (
      !isOnWhiteList && globalThis.location.pathname !== "/maintenance.html"
    ) {
      globalThis.location.href = "/maintenance.html";
    }
  } else if (
    isOnMaintenance === false &&
    globalThis.location.pathname === "/maintenance.html"
  ) {
    console.log("is false now");
    globalThis.location.href = "/hub.html";
  }*/
}, 1000);