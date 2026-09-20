import { getAuthenticatedUser } from "./supabaseClient";

addEventListener("DOMContentLoaded", async() => {
    const isOnMaintenance = import.meta.env.VITE_MAINTENANCE_MODE;
    const rawWhiteList = (import.meta.env.VITE_WHITELIST);
    const whiteListArray = rawWhiteList.split(",");
    const user = await getAuthenticatedUser();
    let isOnWhiteList = false;
    if (user.id != undefined) {
        for (let value in whiteListArray) {
            if (user.id === whiteListArray[value]) {
                isOnWhiteList = true;
                break;
            }
        }
    } else {
        alert("You're not logged on, redirecting you to login!")
        window.location.href = "/login.html"
        return;
    }
    if (isOnMaintenance === "true") {
        if (window.location.pathname === "/maintenance.html" && isOnWhiteList) {
            window.location.href = "/hub.html"
        }
        if (!isOnWhiteList && window.location.pathname !== "/maintenance.html" )
            window.location.href = "/maintenance.html"
    }
})